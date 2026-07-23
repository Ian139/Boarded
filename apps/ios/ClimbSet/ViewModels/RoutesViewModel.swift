import Foundation
import SwiftUI
import Combine
#if canImport(Supabase)
import Supabase
import PostgREST
#endif

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
    func upsertRoute(_ route: Route) {
        if routes.contains(where: { $0.id == route.id }) {
            _ = replaceRoute(route)
        } else {
            routes.append(route)
        }
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
            wallImageWidth: wall.imageWidth,
            wallImageHeight: wall.imageHeight,
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
            wallSnapshot: RouteWallSnapshotPatch(
                wallId: wall.id,
                wallImageUrl: wall.imageUrl,
                wallImageWidth: wall.imageWidth,
                wallImageHeight: wall.imageHeight
            ),
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
    @discardableResult
    func toggleLike(routeId: String, userId: UUID) async -> Route? {
        guard let index = routes.firstIndex(where: { $0.id == routeId }) else { return nil }
        let current = routes[index]
        let currentlyLiked = current.isLiked ?? false
        let desiredLiked = !currentlyLiked
        let currentLikeCount = current.likeCount ?? 0
        let newLikeCount = desiredLiked ? currentLikeCount + 1 : max(0, currentLikeCount - 1)

        // Optimistic update
        routes[index] = Route(
            id: current.id,
            userId: current.userId,
            wallId: current.wallId,
            name: current.name,
            description: current.description,
            gradeV: current.gradeV,
            gradeFont: current.gradeFont,
            holds: current.holds,
            isPublic: current.isPublic,
            viewCount: current.viewCount,
            shareToken: current.shareToken,
            createdAt: current.createdAt,
            updatedAt: current.updatedAt,
            userName: current.userName,
            wallImageUrl: current.wallImageUrl,
            wallImageWidth: current.wallImageWidth,
            wallImageHeight: current.wallImageHeight,
            likeCount: newLikeCount,
            isLiked: desiredLiked,
            ascents: current.ascents,
            comments: current.comments
        )

        #if canImport(Supabase)
        guard !AppLaunchConfiguration.isUITestFixture,
              let client = SupabaseClientProvider.client else {
            return routes[index]
        }
        do {
            if desiredLiked {
                let payload: [String: AnyEncodable] = [
                    "route_id": AnyEncodable(routeId),
                    "user_id": AnyEncodable(userId.uuidString)
                ]
                _ = try await client.from("route_likes").insert(payload).execute()
            } else {
                _ = try await client.from("route_likes")
                    .delete()
                    .eq("route_id", value: routeId)
                    .eq("user_id", value: userId.uuidString)
                    .execute()
            }
        } catch {
            // Revert on error
            if let resetIndex = routes.firstIndex(where: { $0.id == routeId }) {
                routes[resetIndex] = current
            }
            return nil
        }
        #endif

        return routes.first(where: { $0.id == routeId })
    }

    func addAscent(routeId: String, ascent: Ascent) async throws {
        guard let index = routes.firstIndex(where: { $0.id == routeId }) else {
            throw RoutesViewModelError.routeNotLoaded(routeId)
        }
        let current = routes[index]
        let updatedAscents = current.ascents.contains(where: { $0.id == ascent.id })
            ? current.ascents
            : current.ascents + [ascent]

        // Optimistic update preserving route's setter grade
        routes[index] = Route(
            id: current.id,
            userId: current.userId,
            wallId: current.wallId,
            name: current.name,
            description: current.description,
            gradeV: current.gradeV,
            gradeFont: current.gradeFont,
            holds: current.holds,
            isPublic: current.isPublic,
            viewCount: current.viewCount,
            shareToken: current.shareToken,
            createdAt: current.createdAt,
            updatedAt: current.updatedAt,
            userName: current.userName,
            wallImageUrl: current.wallImageUrl,
            wallImageWidth: current.wallImageWidth,
            wallImageHeight: current.wallImageHeight,
            likeCount: current.likeCount,
            isLiked: current.isLiked,
            ascents: updatedAscents,
            comments: current.comments
        )

        #if canImport(Supabase)
        guard !AppLaunchConfiguration.isUITestFixture,
              let client = SupabaseClientProvider.client else { return }
        do {
            let payload = AscentInsert(
                id: ascent.id,
                routeId: routeId,
                userId: ascent.userId,
                userName: ascent.userName ?? "Climber",
                gradeV: ascent.gradeV,
                rating: ascent.rating,
                notes: ascent.notes,
                flashed: ascent.flashed ?? false
            )
            _ = try await client.from("ascents").upsert(payload, onConflict: "id").execute()
        } catch {
            // Revert optimistic update on database error
            if let resetIndex = routes.firstIndex(where: { $0.id == routeId }) {
                routes[resetIndex] = current
            }
            throw error
        }
        #endif
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
            wallImageWidth: updatedRoute.wallImageWidth,
            wallImageHeight: updatedRoute.wallImageHeight,
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
        Double(ProfileStatistics.gradeRank(grade))
    }

    private func displayGrade(for route: Route) -> String? {
        ProfileStatistics.displayGrade(for: route)
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

private enum RoutesViewModelError: LocalizedError {
    case routeNotLoaded(String)

    var errorDescription: String? {
        switch self {
        case .routeNotLoaded(let routeId):
            return "Route \(routeId) is not loaded."
        }
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
