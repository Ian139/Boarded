import Foundation
import SwiftUI
import Combine
import Supabase

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var routesCount: Int = 0
    @Published var sendsCount: Int = 0
    @Published var likesCount: Int = 0
    @Published var highestGrade: String? = nil
    @Published var previousClimbs: [ProfileAscentActivity] = []
    @Published var leaderboardWalls: [Wall] = []
    @Published var selectedLeaderboardWallId: String? = nil
    @Published var leaderboardEntries: [WallLeaderboardEntry] = []

    private var routesForAnalytics: [Route] = []
    private var wallsById: [String: Wall] = [:]

    func load(userId: UUID?) async {
        guard let client = SupabaseClientProvider.client else {
            reset()
            return
        }

        do {
            async let wallRequest: [Wall] = fetchWalls(client: client, userId: userId)
            async let visibleRouteRequest: [Route] = fetchVisibleRoutes(client: client)

            let walls = try await wallRequest
            let visibleRoutes = try await visibleRouteRequest

            routesForAnalytics = visibleRoutes
            leaderboardWalls = walls
            wallsById = Dictionary(uniqueKeysWithValues: walls.map { ($0.id, $0) })
            if selectedLeaderboardWallId == nil || !walls.contains(where: { $0.id == selectedLeaderboardWallId }) {
                selectedLeaderboardWallId = walls.first?.id
            }

            guard let userId else {
                routesCount = 0
                sendsCount = 0
                likesCount = 0
                highestGrade = nil
                previousClimbs = []
                rebuildLeaderboard()
                return
            }

            let routes: [Route] = try await client.database
                .from("routes")
                .select("*, ascents(*)")
                .eq("user_id", value: userId.uuidString)
                .order("created_at", ascending: false)
                .execute()
                .value

            let ascents: [Ascent] = try await client.database
                .from("ascents")
                .select("*")
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value

            let routeIds = routes.map { $0.id }
            let likes: [RouteLike] = routeIds.isEmpty ? [] : (try await client.database
                .from("route_likes")
                .select("route_id")
                .in("route_id", values: routeIds)
                .execute()
                .value)

            routesCount = routes.count
            sendsCount = ascents.count
            likesCount = likes.count
            highestGrade = highestGrade(from: ascents, routes: routes)
            previousClimbs = buildPreviousClimbs(userId: userId.uuidString, routes: visibleRoutes)
            rebuildLeaderboard()
        } catch {
            reset()
        }
    }

    func selectLeaderboardWall(id: String) {
        selectedLeaderboardWallId = id
        rebuildLeaderboard()
    }

    private func fetchWalls(client: SupabaseClient, userId: UUID?) async throws -> [Wall] {
        if let userId {
            return try await client.database
                .from("walls")
                .select("*")
                .or("is_public.eq.true,user_id.eq.\(userId.uuidString)")
                .order("created_at", ascending: false)
                .execute()
                .value
        }

        return try await client.database
            .from("walls")
            .select("*")
            .eq("is_public", value: true)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    private func fetchVisibleRoutes(client: SupabaseClient) async throws -> [Route] {
        do {
            return try await client.database
                .from("routes")
                .select("*, ascents(*), comments(*)")
                .eq("is_public", value: true)
                .order("created_at", ascending: false)
                .execute()
                .value
        } catch {
            let routes: [ProfileRouteWithoutComments] = try await client.database
                .from("routes")
                .select("*, ascents(*)")
                .eq("is_public", value: true)
                .order("created_at", ascending: false)
                .execute()
                .value
            return routes.map { $0.asRoute() }
        }
    }

    private func buildPreviousClimbs(userId: String, routes: [Route]) -> [ProfileAscentActivity] {
        routes.flatMap { route in
            route.ascents
                .filter { $0.userId == userId }
                .map { ascent in
                    ProfileAscentActivity(
                        id: ascent.id,
                        routeId: route.id,
                        routeName: route.name,
                        wallId: route.wallId,
                        wallName: wallsById[route.wallId]?.name ?? "Unknown wall",
                        grade: ascent.gradeV ?? route.gradeV,
                        flashed: ascent.flashed ?? false,
                        createdAt: ascent.createdAt ?? route.createdAt
                    )
                }
        }
        .sorted { parseDate($0.createdAt) > parseDate($1.createdAt) }
        .prefix(8)
        .map { $0 }
    }

    private func rebuildLeaderboard() {
        guard let selectedLeaderboardWallId else {
            leaderboardEntries = []
            return
        }

        let wallRoutes = routesForAnalytics.filter { $0.wallId == selectedLeaderboardWallId }
        var builders: [String: LeaderboardBuilder] = [:]

        for route in wallRoutes {
            for ascent in route.ascents {
                let key = ascent.userId ?? "guest-\(ascent.userName ?? "anonymous")"
                let displayName = ascent.userName?.trimmingCharacters(in: .whitespacesAndNewlines)
                let grade = ascent.gradeV ?? route.gradeV
                let points = gradePoints(grade)
                var builder = builders[key] ?? LeaderboardBuilder(
                    userId: ascent.userId,
                    userName: (displayName?.isEmpty == false ? displayName : nil) ?? "Anonymous",
                    points: 0,
                    sendsCount: 0,
                    highestGrade: nil,
                    highestGradeValue: Int.min
                )
                builder.points += points
                builder.sendsCount += 1
                let value = gradeValue(grade)
                if value > builder.highestGradeValue {
                    builder.highestGrade = grade
                    builder.highestGradeValue = value
                }
                builders[key] = builder
            }
        }

        leaderboardEntries = builders.values
            .map {
                WallLeaderboardEntry(
                    id: $0.userId ?? $0.userName,
                    userId: $0.userId,
                    userName: $0.userName,
                    points: $0.points,
                    sendsCount: $0.sendsCount,
                    highestGrade: $0.highestGrade
                )
            }
            .sorted {
                if $0.points != $1.points { return $0.points > $1.points }
                if $0.sendsCount != $1.sendsCount { return $0.sendsCount > $1.sendsCount }
                return gradeValue($0.highestGrade) > gradeValue($1.highestGrade)
            }
            .prefix(10)
            .map { $0 }
    }

    private func highestGrade(from ascents: [Ascent], routes: [Route]) -> String? {
        let grades = ascents.compactMap(\.gradeV) + routes.compactMap(\.gradeV)
        return grades.max { gradeValue($0) < gradeValue($1) }
    }

    private func gradeValue(_ value: String?) -> Int {
        VGradeOption.value(for: value) ?? -1
    }

    private func gradePoints(_ value: String?) -> Int {
        max(0, gradeValue(value) + 1)
    }

    private func parseDate(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        return fallback.date(from: value) ?? Date.distantPast
    }

    private func reset() {
        routesCount = 0
        sendsCount = 0
        likesCount = 0
        highestGrade = nil
        previousClimbs = []
        leaderboardWalls = []
        selectedLeaderboardWallId = nil
        leaderboardEntries = []
        routesForAnalytics = []
        wallsById = [:]
    }
}

struct ProfileAscentActivity: Identifiable, Hashable {
    let id: String
    let routeId: String
    let routeName: String
    let wallId: String
    let wallName: String
    let grade: String?
    let flashed: Bool
    let createdAt: String
}

struct WallLeaderboardEntry: Identifiable, Hashable {
    let id: String
    let userId: String?
    let userName: String
    let points: Int
    let sendsCount: Int
    let highestGrade: String?
}

private struct LeaderboardBuilder {
    let userId: String?
    var userName: String
    var points: Int
    var sendsCount: Int
    var highestGrade: String?
    var highestGradeValue: Int
}

private struct ProfileRouteWithoutComments: Codable {
    let id: String
    let userId: String?
    let wallId: String
    let name: String
    let description: String?
    let gradeV: FlexibleGrade?
    let gradeFont: String?
    let holds: [Hold]
    let isPublic: Bool
    let viewCount: Int
    let shareToken: String?
    let createdAt: String
    let updatedAt: String
    let userName: String?
    let wallImageUrl: String?
    let ascents: [Ascent]

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case wallId = "wall_id"
        case name
        case description
        case gradeV = "grade_v"
        case gradeFont = "grade_font"
        case holds
        case isPublic = "is_public"
        case viewCount = "view_count"
        case shareToken = "share_token"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case userName = "user_name"
        case wallImageUrl = "wall_image_url"
        case ascents
    }

    func asRoute() -> Route {
        Route(
            id: id,
            userId: userId,
            wallId: wallId,
            name: name,
            description: description,
            gradeV: gradeV?.value,
            gradeFont: gradeFont,
            holds: holds,
            isPublic: isPublic,
            viewCount: viewCount,
            shareToken: shareToken,
            createdAt: createdAt,
            updatedAt: updatedAt,
            userName: userName,
            wallImageUrl: wallImageUrl,
            likeCount: nil,
            isLiked: nil,
            ascents: ascents,
            comments: []
        )
    }
}
