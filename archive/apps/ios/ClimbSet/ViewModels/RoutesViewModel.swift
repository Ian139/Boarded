import Foundation
import SwiftUI
import Combine

@MainActor
final class RoutesViewModel: ObservableObject {
    @Published var routes: [Route] = []
    @Published var isLoading = false
    @Published var errorMessage: String? = nil
    @Published var searchText = ""
    @Published var selectedSort: SortOption = .newest
    @Published var selectedWallFilterId: String? = nil

    private let repository: RoutesRepository
    private var loadGeneration = 0

    func resetForSessionChange() {
        loadGeneration += 1
        routes = []
        errorMessage = nil
    }

    init(repository: RoutesRepository) {
        self.repository = repository
    }

    func load(userId: UUID?) async {
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        errorMessage = nil
        defer {
            if generation == loadGeneration {
                isLoading = false
            }
        }
        do {
            let data = try await repository.fetchRoutes(userId: userId)
            guard generation == loadGeneration else { return }
            routes = data
        } catch {
            guard generation == loadGeneration else { return }
            routes = []
            errorMessage = error.localizedDescription
        }
    }
    func fetchSharedRoute(token: String) async throws -> Route {
        try await repository.fetchRouteByShareToken(token)
    }

    func createRoute(
        name: String,
        gradeV: String?,
        holds: [Hold],
        wall: Wall,
        userId: UUID?,
        userName: String
    ) async throws {
        let draft = RouteDraft(
            userId: userId?.uuidString,
            userName: userName,
            wallId: wall.id,
            wallImageUrl: wall.imageUrl,
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            description: nil,
            gradeV: gradeV,
            gradeFont: nil,
            holds: holds,
            isPublic: true
        )

        let route = try await repository.createRoute(draft)
        routes.removeAll { $0.id == route.id }
        routes.insert(route, at: 0)
    }

    func assignWall(routeId: String, wall: Wall) async throws {
        let patch = RoutePatch(
            wallId: wall.id,
            wallImageUrl: wall.imageUrl,
            name: nil,
            gradeV: nil,
            holds: nil
        )
        let updatedRoute = try await repository.updateRoute(id: routeId, patch: patch)
        _ = replaceRoute(updatedRoute)
    }

    func updateRoute(routeId: String, patch: RoutePatch) async throws -> Route {
        let updatedRoute = try await repository.updateRoute(id: routeId, patch: patch)
        return replaceRoute(updatedRoute)
    }

    func deleteRoute(routeId: String) async throws {
        try await repository.deleteRoute(id: routeId)
        routes.removeAll { $0.id == routeId }
    }

    private func replaceRoute(_ updatedRoute: Route) -> Route {
        guard let index = routes.firstIndex(where: { $0.id == updatedRoute.id }) else {
            return updatedRoute
        }

        let current = routes[index]
        let reconciledRoute = Route(
            id: updatedRoute.id,
            userId: updatedRoute.userId,
            wallId: updatedRoute.wallId,
            name: updatedRoute.name,
            description: updatedRoute.description,
            gradeV: updatedRoute.gradeV,
            gradeFont: updatedRoute.gradeFont,
            holds: updatedRoute.holds,
            isPublic: updatedRoute.isPublic,
            viewCount: updatedRoute.viewCount,
            shareToken: updatedRoute.shareToken,
            createdAt: updatedRoute.createdAt,
            updatedAt: updatedRoute.updatedAt,
            userName: updatedRoute.userName,
            wallImageUrl: updatedRoute.wallImageUrl,
            likeCount: updatedRoute.likeCount ?? current.likeCount,
            isLiked: updatedRoute.isLiked ?? current.isLiked,
            ascents: updatedRoute.ascents,
            comments: updatedRoute.comments
        )
        routes[index] = reconciledRoute
        return reconciledRoute
    }


    var filteredRoutes: [Route] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let wallFiltered = routes.filter { route in
            guard let selectedWallFilterId else { return true }
            return route.wallId == selectedWallFilterId
        }
        let base = query.isEmpty ? wallFiltered : wallFiltered.filter {
            $0.name.lowercased().contains(query)
                || ($0.userName ?? "").lowercased().contains(query)
                || ($0.gradeV ?? "").lowercased().contains(query)
        }
        return base.sorted { a, b in
            switch selectedSort {
            case .newest:
                return parseDate(a.createdAt) > parseDate(b.createdAt)
            case .mostLiked:
                return (a.likeCount ?? 0) > (b.likeCount ?? 0)
            case .mostClimbed:
                return a.ascents.count > b.ascents.count
            }
        }
    }

    private func parseDate(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        if let date = fallback.date(from: value) {
            return date
        }
        return Date()
    }
}


enum SortOption: String, CaseIterable, Identifiable {
    case newest = "Newest"
    case mostLiked = "Most Liked"
    case mostClimbed = "Most Climbed"

    var id: String { rawValue }
}
