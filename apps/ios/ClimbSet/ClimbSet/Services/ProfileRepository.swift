import Foundation
import Supabase

struct ProfileMetrics: Hashable, Codable {
    let routesCount: Int
    let likesCount: Int
}

protocol ProfileRepository {
    func fetchProfile(userID: UUID) async throws -> Profile?
    func fetchLeaderboard() async throws -> [ProfileLeaderboardEntry]
    func fetchClimbHistory(userID: UUID) async throws -> [ProfileClimbHistoryItem]
    func fetchMetrics(userID: UUID) async throws -> ProfileMetrics
}

enum ProfileRepositoryError: LocalizedError {
    case unavailable
    case invalidUserID

    var errorDescription: String? {
        switch self {
        case .unavailable: return "Profile data is unavailable right now."
        case .invalidUserID: return "The selected account is invalid."
        }
    }
}

struct SupabaseProfileRepository: ProfileRepository {
    private let client: SupabaseClient?

    init(client: SupabaseClient?) {
        self.client = client
    }

    @MainActor init() {
        self.init(client: SupabaseClientProvider.client)
    }

    func fetchProfile(userID: UUID) async throws -> Profile? {
        guard let client else { throw ProfileRepositoryError.unavailable }
        let profiles: [Profile] = try await client.from("profiles")
            .select("id,username,full_name,avatar_url,bio,created_at")
            .eq("id", value: userID.uuidString)
            .limit(1)
            .execute()
            .value
        return profiles.first
    }

    func fetchLeaderboard() async throws -> [ProfileLeaderboardEntry] {
        guard let client else { throw ProfileRepositoryError.unavailable }
        let ascents: [Ascent] = try await client.from("ascents")
            .select("id,route_id,user_id,user_name,grade_v,rating,notes,flashed,created_at")
            .order("created_at", ascending: false)
            .execute()
            .value
        let routes = try await fetchRoutes(for: Set(ascents.map(\.routeId)), client: client)
        let profiles = try await fetchProfiles(for: Set(ascents.compactMap(\.userId)), client: client)
        let records = makeRecords(ascents: ascents, routes: routes)
        return ProfileStatistics.calculate(
            records: records,
            profiles: profiles,
            selectedUserID: "__leaderboard__"
        ).leaderboard
    }

    func fetchClimbHistory(userID: UUID) async throws -> [ProfileClimbHistoryItem] {
        guard let client else { throw ProfileRepositoryError.unavailable }
        let userIDString = userID.uuidString
        let ascents: [Ascent] = try await client.from("ascents")
            .select("id,route_id,user_id,user_name,grade_v,rating,notes,flashed,created_at")
            .eq("user_id", value: userIDString)
            .order("created_at", ascending: false)
            .execute()
            .value
        let routes = try await fetchRoutes(for: Set(ascents.map(\.routeId)), client: client)
        return makeRecords(ascents: ascents, routes: routes)
            .sorted { lhs, rhs in
                let left = lhs.completedAt ?? .distantPast
                let right = rhs.completedAt ?? .distantPast
                if left != right { return left > right }
                return lhs.id < rhs.id
            }
            .map { record in
                ProfileClimbHistoryItem(
                    id: record.id,
                    routeId: record.routeId,
                    routeName: record.routeName,
                    wallId: record.route?.wallId,
                    grade: record.scoringGrade,
                    flashed: record.flashed,
                    completedAt: record.completedAt,
                    route: record.route
                )
            }
    }

    func fetchMetrics(userID: UUID) async throws -> ProfileMetrics {
        guard let client else { throw ProfileRepositoryError.unavailable }
        let userIDString = userID.uuidString

        struct RouteID: Decodable {
            let id: String
        }

        let routeIDs: [RouteID] = try await client.from("routes")
            .select("id")
            .eq("user_id", value: userIDString)
            .execute()
            .value

        let routeIDStrings = routeIDs.map(\.id)
        let likes: [RouteLike]
        if routeIDStrings.isEmpty {
            likes = []
        } else {
            likes = try await client.from("route_likes")
                .select("route_id")
                .in("route_id", values: routeIDStrings)
                .execute()
                .value
        }

        return ProfileMetrics(routesCount: routeIDStrings.count, likesCount: likes.count)
    }

    private func fetchRoutes(for ids: Set<String>, client: SupabaseClient) async throws -> [Route] {
        guard !ids.isEmpty else { return [] }
        return try await client.from("routes")
            .select("id,user_id,user_name,wall_id,name,description,grade_v,grade_font,holds,is_public,view_count,share_token,created_at,updated_at,wall_image_url,wall_image_width,wall_image_height,ascents(id,route_id,user_id,user_name,grade_v,rating,notes,flashed,created_at)")
            .in("id", values: Array(ids))
            .execute()
            .value
    }

    private func fetchProfiles(for ids: Set<String>, client: SupabaseClient) async throws -> [String: Profile] {
        guard !ids.isEmpty else { return [:] }
        let profiles: [Profile] = try await client.from("profiles")
            .select("id,username,full_name,avatar_url,bio,created_at")
            .in("id", values: Array(ids))
            .execute()
            .value
        return Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })
    }

    private func makeRecords(ascents: [Ascent], routes: [Route]) -> [ProfileScoringRecord] {
        let routesByID = Dictionary(uniqueKeysWithValues: routes.map { ($0.id, $0) })
        return ascents.compactMap { ascent in
            guard let userID = ascent.userId, !userID.isEmpty else { return nil }
            let route = routesByID[ascent.routeId]
            return ProfileScoringRecord(
                id: ascent.id,
                userId: userID,
                userName: ascent.userName,
                routeId: ascent.routeId,
                routeName: route?.name ?? "Unavailable Route",
                routeGrade: route?.gradeV,
                ascentGrade: ascent.gradeV,
                flashed: ascent.flashed ?? false,
                completedAt: parseDate(ascent.createdAt),
                route: route
            )
        }
    }

    private func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: value) { return date }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: value)
    }
}

/// Deterministic data source for previews and unit tests only. Production code
/// always uses SupabaseProfileRepository and surfaces configuration/network errors.
struct MockProfileRepository: ProfileRepository {
    let profile: Profile?
    let leaderboard: [ProfileLeaderboardEntry]
    let history: [ProfileClimbHistoryItem]
    let metrics: ProfileMetrics
    let error: Error?

    init(
        profile: Profile? = nil,
        leaderboard: [ProfileLeaderboardEntry] = [],
        history: [ProfileClimbHistoryItem] = [],
        metrics: ProfileMetrics = ProfileMetrics(routesCount: 0, likesCount: 0),
        error: Error? = nil
    ) {
        self.profile = profile
        self.leaderboard = leaderboard
        self.history = history
        self.metrics = metrics
        self.error = error
    }

    func fetchProfile(userID: UUID) async throws -> Profile? {
        if let error { throw error }
        return profile
    }

    func fetchLeaderboard() async throws -> [ProfileLeaderboardEntry] {
        if let error { throw error }
        return leaderboard
    }

    func fetchClimbHistory(userID: UUID) async throws -> [ProfileClimbHistoryItem] {
        if let error { throw error }
        return history
    }

    func fetchMetrics(userID: UUID) async throws -> ProfileMetrics {
        if let error { throw error }
        return metrics
    }
}
