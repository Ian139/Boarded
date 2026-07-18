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
