import Foundation

struct Hold: Codable, Identifiable, Hashable {
    let id: String
    var x: Double
    var y: Double
    var type: HoldType
    var color: String
    var size: HoldSize
    /// An optional image-space radius. Older routes only have a discrete `size`.
    /// Keeping this optional preserves decoding and rendering for existing JSON.
    var radius: Double?
    let notes: String?

    init(
        id: String,
        x: Double,
        y: Double,
        type: HoldType,
        color: String,
        size: HoldSize,
        radius: Double? = nil,
        notes: String?
    ) {
        self.id = id
        self.x = x
        self.y = y
        self.type = type
        self.color = color
        self.size = size
        self.radius = radius
        self.notes = notes
    }
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
struct VGradeOption: Identifiable, Hashable {
    let value: Int
    let label: String

    var id: Int { value }

    static let all: [VGradeOption] = [
        VGradeOption(value: -1, label: "VB"),
        VGradeOption(value: 0, label: "V0"),
        VGradeOption(value: 1, label: "V1"),
        VGradeOption(value: 2, label: "V2"),
        VGradeOption(value: 3, label: "V3"),
        VGradeOption(value: 4, label: "V4"),
        VGradeOption(value: 5, label: "V5"),
        VGradeOption(value: 6, label: "V6"),
        VGradeOption(value: 7, label: "V7"),
        VGradeOption(value: 8, label: "V8"),
        VGradeOption(value: 9, label: "V9"),
        VGradeOption(value: 10, label: "V10"),
        VGradeOption(value: 11, label: "V11"),
        VGradeOption(value: 12, label: "V12"),
        VGradeOption(value: 13, label: "V13"),
        VGradeOption(value: 14, label: "V14"),
        VGradeOption(value: 15, label: "V15"),
        VGradeOption(value: 16, label: "V16"),
        VGradeOption(value: 17, label: "V17")
    ]

    nonisolated static func label(for value: Int?) -> String? {
        guard let value else { return nil }
        if value == -1 { return "VB" }
        return (0...17).contains(value) ? "V\(value)" : nil
    }

    static func value(for label: String?) -> Int? {
        guard let label else { return nil }
        let normalized = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return nil }
        if let numericValue = Int(normalized) { return numericValue }
        return all.first { $0.label.caseInsensitiveCompare(normalized) == .orderedSame }?.value
    }
}

struct FlexibleGrade: Codable, Hashable {
    let value: String?

    init(value: String?) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = nil
        } else if let numericValue = try? container.decode(Double.self) {
            value = VGradeOption.label(for: Int(exactly: numericValue))
        } else if let stringValue = try? container.decode(String.self) {
            value = Self.canonicalLabel(for: stringValue)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected a numeric or V-scale grade."
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }

    private static func canonicalLabel(for value: String) -> String? {
        guard let numericValue = VGradeOption.value(for: value) else { return nil }
        return VGradeOption.label(for: numericValue)
    }
}

extension KeyedDecodingContainer {
    func decodeFlexibleGrade(forKey key: Key) throws -> String? {
        guard contains(key), try !decodeNil(forKey: key) else { return nil }
        return try decode(FlexibleGrade.self, forKey: key).value
    }
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
    let wallImageWidth: Int?
    let wallImageHeight: Int?
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
        case wallImageWidth = "wall_image_width"
        case wallImageHeight = "wall_image_height"
        case likeCount = "like_count"
        case isLiked = "is_liked"
        case ascents
        case comments
    }
}
extension Route {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decodeIfPresent(String.self, forKey: .userId)
        wallId = try container.decode(String.self, forKey: .wallId)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        gradeV = try container.decodeFlexibleGrade(forKey: .gradeV)
        gradeFont = try container.decodeIfPresent(String.self, forKey: .gradeFont)
        holds = try container.decode([Hold].self, forKey: .holds)
        isPublic = try container.decodeIfPresent(Bool.self, forKey: .isPublic) ?? true
        viewCount = try container.decodeIfPresent(Int.self, forKey: .viewCount) ?? 0
        shareToken = try container.decodeIfPresent(String.self, forKey: .shareToken)
        createdAt = try container.decode(String.self, forKey: .createdAt)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
        userName = try container.decodeIfPresent(String.self, forKey: .userName)
        wallImageUrl = try container.decodeIfPresent(String.self, forKey: .wallImageUrl)
        wallImageWidth = try container.decodeIfPresent(Int.self, forKey: .wallImageWidth)
        wallImageHeight = try container.decodeIfPresent(Int.self, forKey: .wallImageHeight)
        likeCount = try container.decodeIfPresent(Int.self, forKey: .likeCount)
        isLiked = try container.decodeIfPresent(Bool.self, forKey: .isLiked)
        ascents = try container.decodeIfPresent([Ascent].self, forKey: .ascents) ?? []
        comments = try container.decodeIfPresent([Comment].self, forKey: .comments) ?? []
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
    init(
        id: String,
        routeId: String,
        userId: String? = nil,
        userName: String? = nil,
        gradeV: String? = nil,
        rating: Int? = nil,
        notes: String? = nil,
        flashed: Bool? = nil,
        createdAt: String? = nil
    ) {
        self.id = id
        self.routeId = routeId
        self.userId = userId
        self.userName = userName
        self.gradeV = gradeV
        self.rating = rating
        self.notes = notes
        self.flashed = flashed
        self.createdAt = createdAt
    }

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
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        routeId = try container.decode(String.self, forKey: .routeId)
        userId = try container.decodeIfPresent(String.self, forKey: .userId)
        userName = try container.decodeIfPresent(String.self, forKey: .userName)
        gradeV = try container.decodeFlexibleGrade(forKey: .gradeV)
        rating = try container.decodeIfPresent(Int.self, forKey: .rating)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
        flashed = try container.decodeIfPresent(Bool.self, forKey: .flashed)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
    }
}
struct AscentInsert: Encodable {
    let id: String
    let routeId: String
    let userId: String?
    let userName: String
    let gradeV: String?
    let rating: Int?
    let notes: String?
    let flashed: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case routeId = "route_id"
        case userId = "user_id"
        case userName = "user_name"
        case gradeV = "grade_v"
        case rating
        case notes
        case flashed
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
