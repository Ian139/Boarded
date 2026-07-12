import Foundation

struct Hold: Codable, Identifiable, Hashable {
    let id: String
    let x: Double
    let y: Double
    let type: HoldType
    let color: String
    let sequence: Int?
    let size: HoldSize
    let notes: String?
}

enum HoldType: String, Codable, CaseIterable {
    case start
    case hand
    case foot
    case finish
}

enum HoldSize: String, Codable, CaseIterable {
    case small
    case medium
    case large
}

struct Route: Codable, Identifiable, Hashable {
    let id: String
    let userId: String?
    let wallId: String
    let name: String
    let description: String?
    let gradeV: String?
    let gradeFont: String?
    let holds: [Hold]
    let isPublic: Bool
    let viewCount: Int
    let shareToken: String?
    let createdAt: String
    let updatedAt: String
    let userName: String?
    let wallImageUrl: String?
    var likeCount: Int?
    var isLiked: Bool?
    let ascents: [Ascent]
    let comments: [Comment]

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
        case likeCount = "like_count"
        case isLiked = "is_liked"
        case ascents
        case comments
    }
}

struct Wall: Codable, Identifiable, Hashable {
    let id: String
    let userId: String?
    let name: String
    let description: String?
    let imageUrl: String?
    let imageWidth: Int?
    let imageHeight: Int?
    let isPublic: Bool?
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case name
        case description
        case imageUrl = "image_url"
        case imageWidth = "image_width"
        case imageHeight = "image_height"
        case isPublic = "is_public"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct Ascent: Codable, Identifiable, Hashable {
    let id: String
    let routeId: String
    let userId: String?
    let userName: String?
    let gradeV: String?
    let rating: Int?
    let notes: String?
    let flashed: Bool?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case routeId = "route_id"
        case userId = "user_id"
        case userName = "user_name"
        case gradeV = "grade_v"
        case rating
        case notes
        case flashed
        case createdAt = "created_at"
    }
}

struct Comment: Codable, Identifiable, Hashable {
    let id: String
    let routeId: String
    let userId: String?
    let userName: String?
    let content: String
    let isBeta: Bool
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case routeId = "route_id"
        case userId = "user_id"
        case userName = "user_name"
        case content
        case isBeta = "is_beta"
        case createdAt = "created_at"
    }
}

private func normalizedHoldCoordinate(_ value: Double) -> Double {
    value > 1 ? value / 100.0 : value
}

extension Hold {
    var normalizedX: Double {
        normalizedHoldCoordinate(x)
    }

    var normalizedY: Double {
        normalizedHoldCoordinate(y)
    }
}

func normalizedRemoteImageURLString(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !trimmed.hasPrefix("/") else { return nil }
    return trimmed
}

extension Route {
    var normalizedWallImageUrl: String? {
        normalizedRemoteImageURLString(wallImageUrl)
    }

    var wallImageURL: URL? {
        guard let normalizedWallImageUrl else { return nil }
        return URL(string: normalizedWallImageUrl)
    }
}

extension Wall {
    var normalizedImageUrl: String? {
        normalizedRemoteImageURLString(imageUrl)
    }

    var imageURL: URL? {
        guard let normalizedImageUrl else { return nil }
        return URL(string: normalizedImageUrl)
    }
}

extension HoldType {
    var shortLabel: String {
        switch self {
        case .start: return "S"
        case .hand: return "H"
        case .foot: return "F"
        case .finish: return "T"
        }
    }

    var colorHex: String {
        switch self {
        case .start: return "#10b981"
        case .hand: return "#ef4444"
        case .foot: return "#3b82f6"
        case .finish: return "#f59e0b"
        }
    }
}
