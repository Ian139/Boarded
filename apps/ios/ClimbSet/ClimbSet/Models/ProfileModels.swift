import Foundation

struct Profile: Codable, Identifiable, Hashable {
    let id: String
    let username: String?
    let fullName: String?
    let avatarUrl: String?
    let bio: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case username
        case fullName = "full_name"
        case avatarUrl = "avatar_url"
        case bio
        case createdAt = "created_at"
    }

    nonisolated var displayName: String {
        if let fullName, !fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return fullName
        }
        if let username, !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return username
        }
        return "Anonymous"
    }
}

struct ProfileUpdate: Encodable {
    let id: String
    let fullName: String?
    let username: String?
    let bio: String?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case username
        case bio
    }
}

struct RouteLike: Codable, Hashable {
    let routeId: String

    enum CodingKeys: String, CodingKey {
        case routeId = "route_id"
    }
}

/// A normalized, decoded ascent joined to the route that supplied its metadata.
/// `route` remains nil when RLS hides a deleted/private route; the history row is
/// still retained and rendered as unavailable.
struct ProfileScoringRecord: Identifiable, Hashable {
    let id: String
    let userId: String
    let userName: String?
    let routeId: String
    let routeName: String
    let routeGrade: String?
    let ascentGrade: String?
    let flashed: Bool
    let completedAt: Date?
    let attemptCount: Int?
    let firstAttemptAt: Date?
    let route: Route?

    init(
        id: String,
        userId: String,
        userName: String? = nil,
        routeId: String,
        routeName: String,
        routeGrade: String? = nil,
        ascentGrade: String? = nil,
        flashed: Bool = false,
        completedAt: Date? = nil,
        attemptCount: Int? = nil,
        firstAttemptAt: Date? = nil,
        route: Route? = nil
    ) {
        self.id = id
        self.userId = userId
        self.userName = userName
        self.routeId = routeId
        self.routeName = routeName
        self.routeGrade = routeGrade
        self.ascentGrade = ascentGrade
        self.flashed = flashed
        self.completedAt = completedAt
        self.attemptCount = attemptCount
        self.firstAttemptAt = firstAttemptAt
        self.route = route
    }

    nonisolated var scoringGrade: String? {
        guard let route else { return ascentGrade ?? routeGrade }
        return ProfileStatistics.displayGrade(for: route)
    }
}

struct ProfileClimbHistoryItem: Identifiable, Hashable {
    let id: String
    let routeId: String
    let routeName: String
    let wallId: String?
    let grade: String?
    let flashed: Bool
    let completedAt: Date?
    let route: Route?

    var isAvailable: Bool { route != nil }
}

struct ProfileLeaderboardEntry: Identifiable, Hashable {
    let id: String
    let displayName: String
    let points: Int?
    let sendsCount: Int
    let highestGrade: String?
    let profile: Profile?
}

struct ProfileHighlights: Hashable {
    let bestClimb: ProfileClimbHistoryItem?
    let longestProject: ProfileClimbHistoryItem?
}
