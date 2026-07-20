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
    @Published var isAllWallsSelected = false
    @Published var selectedGradeFilter = "all"
    private let repository: RoutesRepository
    private var loadGeneration = 0

    init(repository: RoutesRepository) {
        self.repository = repository
    }
    func resetForSessionChange() {
        loadGeneration += 1
        routes = []
        errorMessage = nil
        searchText = ""
        selectedSort = .newest
        selectedWallFilterId = nil
        isAllWallsSelected = false
        selectedGradeFilter = "all"
    }

    func clearFilters() {
        searchText = ""
        selectedGradeFilter = "all"
    }

    func selectAllWalls() {
        selectedWallFilterId = nil
        isAllWallsSelected = true
    }

    func selectWall(id: String) {
        selectedWallFilterId = id
        isAllWallsSelected = false
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
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
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
    var availableGrades: [String] {
        let scopedRoutes: [Route]
        if isAllWallsSelected {
            scopedRoutes = routes
        } else if let selectedWallFilterId {
            scopedRoutes = routes.filter { $0.wallId == selectedWallFilterId }
        } else {
            scopedRoutes = []
        }
        return Array(Set(scopedRoutes.compactMap(\.gradeV)))
            .sorted { gradeNumber($0) < gradeNumber($1) }
    }

    var hasFilters: Bool {
        !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || selectedGradeFilter != "all"
    }

    var filteredRoutes: [Route] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let wallFiltered: [Route]
        if isAllWallsSelected {
            wallFiltered = routes
        } else if let selectedWallFilterId {
            wallFiltered = routes.filter { $0.wallId == selectedWallFilterId }
        } else {
            wallFiltered = []
        }
        let base = wallFiltered.filter { route in
            let matchesSearch = query.isEmpty
                || route.name.lowercased().contains(query)
                || (route.userName ?? "").lowercased().contains(query)
                || (route.gradeV ?? "").lowercased().contains(query)
            let matchesGrade = selectedGradeFilter == "all" || route.gradeV == selectedGradeFilter
            return matchesSearch && matchesGrade
        }

        return base.sorted { lhs, rhs in
            switch selectedSort {
            case .newest:
                return parseDate(lhs.createdAt) > parseDate(rhs.createdAt)
            case .oldest:
                return parseDate(lhs.createdAt) < parseDate(rhs.createdAt)
            case .name:
                return lhs.name.localizedCompare(rhs.name) == .orderedAscending
            case .gradeAscending:
                return gradeNumber(displayGrade(for: lhs)) < gradeNumber(displayGrade(for: rhs))
            case .gradeDescending:
                return gradeNumber(displayGrade(for: lhs)) > gradeNumber(displayGrade(for: rhs))
            case .rating:
                return averageRating(for: lhs) > averageRating(for: rhs)
            case .mostLiked:
                return (lhs.likeCount ?? 0) > (rhs.likeCount ?? 0)
            case .mostClimbed:
                return lhs.ascents.count > rhs.ascents.count
            case .mostViewed:
                return lhs.viewCount > rhs.viewCount
            }
        }
    }

    private func parseDate(_ value: String) -> Date {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) {
            return date
        }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: value) ?? .distantPast
    }

    private func gradeNumber(_ grade: String?) -> Double {
        guard let grade else { return -1 }
        guard let option = VGradeOption.all.first(where: {
            $0.label.caseInsensitiveCompare(grade) == .orderedSame
        }) else {
            return -1
        }
        return Double(option.value)
    }

    private func displayGrade(for route: Route) -> String? {
        let setterGrade = gradeNumber(route.gradeV)
        let userGrades = route.ascents.compactMap { ascent -> Double? in
            guard let grade = ascent.gradeV else { return nil }
            let value = gradeNumber(grade)
            return value >= 0 ? value : nil
        }

        guard setterGrade >= 0 || !userGrades.isEmpty else { return nil }
        guard !userGrades.isEmpty else { return route.gradeV }

        let average = userGrades.reduce(0, +) / Double(userGrades.count)
        let combined = setterGrade >= 0 ? (setterGrade * 0.5) + (average * 0.5) : average
        return VGradeOption.label(for: Int(combined.rounded()))
    }

    private func averageRating(for route: Route) -> Double {
        let ratings = route.ascents.compactMap { ascent -> Int? in
            guard let rating = ascent.rating, rating != 0 else { return nil }
            return rating
        }
        guard !ratings.isEmpty else { return 0 }
        return Double(ratings.reduce(0, +)) / Double(ratings.count)
    }
}

enum SortOption: String, CaseIterable, Identifiable {
    case newest
    case oldest
    case name
    case gradeAscending = "grade-asc"
    case gradeDescending = "grade-desc"
    case rating
    case mostLiked = "most-liked"
    case mostClimbed = "most-climbed"
    case mostViewed = "most-viewed"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .newest: return "Sort: Newest"
        case .oldest: return "Sort: Oldest"
        case .name: return "Sort: Name"
        case .gradeAscending: return "Sort: Easiest"
        case .gradeDescending: return "Sort: Hardest"
        case .rating: return "Sort: Top Rated"
        case .mostLiked: return "Sort: Most Liked"
        case .mostClimbed: return "Sort: Most Climbed"
        case .mostViewed: return "Sort: Most Viewed"
        }
    }

    var chipLabel: String {
        String(label.dropFirst("Sort: ".count))
    }
}
