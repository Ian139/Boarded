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

    init(repository: RoutesRepository) {
        self.repository = repository
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let data = try await repository.fetchRoutes()
            routes = data
        } catch {
            routes = []
            errorMessage = error.localizedDescription
        }
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
            gradeV: gradeV?.trimmingCharacters(in: .whitespacesAndNewlines),
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
        try await repository.updateRoute(id: routeId, patch: patch)

        guard let index = routes.firstIndex(where: { $0.id == routeId }) else { return }
        let current = routes[index]
        routes[index] = Route(
            id: current.id,
            userId: current.userId,
            wallId: wall.id,
            name: current.name,
            description: current.description,
            gradeV: current.gradeV,
            gradeFont: current.gradeFont,
            holds: current.holds,
            isPublic: current.isPublic,
            viewCount: current.viewCount,
            shareToken: current.shareToken,
            createdAt: current.createdAt,
            updatedAt: iso8601Now(),
            userName: current.userName,
            wallImageUrl: wall.imageUrl,
            likeCount: current.likeCount,
            isLiked: current.isLiked,
            ascents: current.ascents,
            comments: current.comments
        )
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

private func iso8601Now() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
}

enum SortOption: String, CaseIterable, Identifiable {
    case newest = "Newest"
    case mostLiked = "Most Liked"
    case mostClimbed = "Most Climbed"

    var id: String { rawValue }
}
