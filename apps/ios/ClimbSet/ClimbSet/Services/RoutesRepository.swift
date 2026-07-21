import Foundation

protocol RoutesRepository {
    func fetchRoutes(userId: UUID?) async throws -> [Route]
    func fetchRouteByShareToken(_ token: String) async throws -> Route
    func createRoute(_ draft: RouteDraft) async throws -> Route
    func updateRoute(id: String, patch: RoutePatch) async throws -> Route
    func enableSharing(id: String, shareToken: String) async throws -> Route
    func deleteRoute(id: String) async throws
}

struct RouteDraft {
    let userId: String?
    let userName: String
    let wallId: String
    let wallImageUrl: String?
    let wallImageWidth: Int?
    let wallImageHeight: Int?
    let name: String
    let description: String?
    let gradeV: String?
    let gradeFont: String?
    let holds: [Hold]
    let isPublic: Bool
}

struct RouteWallSnapshotPatch {
    let wallId: String
    let wallImageUrl: String?
    let wallImageWidth: Int?
    let wallImageHeight: Int?
}

struct RoutePatch {
    /// Nil snapshot fields are omitted as a group; a present snapshot writes all four columns.
    let wallSnapshot: RouteWallSnapshotPatch?
    let name: String?
    let gradeV: String?
    let holds: [Hold]?
}

struct MockRoutesRepository: RoutesRepository {
    private final class Storage {
        var routes: [Route]

        init(routes: [Route]) {
            self.routes = routes
        }
    }

    private let storage: Storage

    init(fixture: Bool = false) {
        storage = Storage(routes: [
            Route(
                id: UUID().uuidString,
                userId: "local",
                wallId: "wall-1",
                name: "Granite Drift",
                description: "Slabby tech and a tight finish.",
                gradeV: "V4",
                gradeFont: nil,
                holds: [
                    Hold(id: UUID().uuidString, x: 18, y: 72, type: .start, color: HoldType.start.colorHex, size: .medium, notes: nil),
                    Hold(id: UUID().uuidString, x: 34, y: 54, type: .hand, color: HoldType.hand.colorHex, size: .medium, notes: nil),
                    Hold(id: UUID().uuidString, x: 61, y: 44, type: .foot, color: HoldType.foot.colorHex, size: .small, notes: nil),
                    Hold(id: UUID().uuidString, x: 77, y: 22, type: .finish, color: HoldType.finish.colorHex, size: .large, notes: nil)
                ],
                isPublic: true,
                viewCount: 32,
                shareToken: nil,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                updatedAt: ISO8601DateFormatter().string(from: Date()),
                userName: "Ian",
                wallImageUrl: nil,
                wallImageWidth: nil,
                wallImageHeight: nil,
                likeCount: 12,
                isLiked: false,
                ascents: [],
                comments: []
            ),
            Route(
                id: UUID().uuidString,
                userId: "local",
                wallId: "wall-2",
                name: "Mossy Traverse",
                description: "Long moves with a heel finish.",
                gradeV: "V6",
                gradeFont: nil,
                holds: [
                    Hold(id: UUID().uuidString, x: 12, y: 60, type: .start, color: HoldType.start.colorHex, size: .medium, notes: nil),
                    Hold(id: UUID().uuidString, x: 48, y: 58, type: .hand, color: HoldType.hand.colorHex, size: .medium, notes: nil),
                    Hold(id: UUID().uuidString, x: 69, y: 52, type: .hand, color: HoldType.hand.colorHex, size: .medium, notes: nil),
                    Hold(id: UUID().uuidString, x: 86, y: 27, type: .finish, color: HoldType.finish.colorHex, size: .large, notes: nil)
                ],
                isPublic: true,
                viewCount: 18,
                shareToken: nil,
                createdAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-86000)),
                updatedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-86000)),
                userName: "Boarded",
                wallImageUrl: nil,
                wallImageWidth: nil,
                wallImageHeight: nil,
                likeCount: 8,
                isLiked: false,
                ascents: [],
                comments: []
            )
        ])
        if fixture {
            storage.routes = storage.routes.enumerated().map { index, route in
                Self.fixtureRoute(route, index: index)
            }
        }
    }

    private static func fixtureRoute(_ route: Route, index: Int) -> Route {
        Route(
            id: index == 0 ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222",
            userId: "11111111-1111-4111-8111-111111111111",
            wallId: index == 0 ? "wall-1" : "wall-2",
            name: route.name,
            description: route.description,
            gradeV: route.gradeV,
            gradeFont: route.gradeFont,
            holds: route.holds.enumerated().map { holdIndex, hold in
                Hold(
                    id: "\(index + 1)-\(holdIndex + 1)",
                    x: hold.x,
                    y: hold.y,
                    type: hold.type,
                    color: hold.color,
                    size: hold.size,
                    radius: hold.radius,
                    notes: hold.notes
                )
            },
            isPublic: true,
            viewCount: route.viewCount,
            shareToken: index == 0 ? "fixture-granite" : "fixture-mossy",
            createdAt: index == 0 ? "2026-01-01T00:00:00Z" : "2026-01-02T00:00:00Z",
            updatedAt: index == 0 ? "2026-01-01T00:00:00Z" : "2026-01-02T00:00:00Z",
            userName: index == 0 ? "Fixture Climber" : route.userName,
            wallImageUrl: "fixture://default-wall",
            wallImageWidth: route.wallImageWidth,
            wallImageHeight: route.wallImageHeight,
            likeCount: route.likeCount,
            isLiked: route.isLiked,
            ascents: route.ascents,
            comments: route.comments
        )
    }

    func fetchRoutes(userId: UUID?) async throws -> [Route] {
        storage.routes
    }
    func fetchRouteByShareToken(_ token: String) async throws -> Route {
        guard isValidShareToken(token) else {
            throw RoutesRepositoryError.invalidShareToken
        }
        guard let route = storage.routes.first(where: {
            $0.shareToken == token && $0.isPublic
        }) else {
            throw RoutesRepositoryError.notFound
        }
        return route
    }

    func createRoute(_ draft: RouteDraft) async throws -> Route {
        let route = buildRoute(
            id: UUID().uuidString,
            draft: draft,
            shareToken: generateShareToken(),
            timestamp: isoTimestamp()
        )
        storage.routes.append(route)
        return route
    }

    func updateRoute(id: String, patch: RoutePatch) async throws -> Route {
        guard let index = storage.routes.firstIndex(where: { $0.id == id }) else {
            throw RoutesRepositoryError.notFound
        }

        let current = storage.routes[index]
        let snapshot = patch.wallSnapshot
        let updatedRoute = Route(
            id: current.id,
            userId: current.userId,
            wallId: snapshot?.wallId ?? current.wallId,
            name: patch.name ?? current.name,
            description: current.description,
            gradeV: patch.gradeV ?? current.gradeV,
            gradeFont: current.gradeFont,
            holds: patch.holds ?? current.holds,
            isPublic: current.isPublic,
            viewCount: current.viewCount,
            shareToken: current.shareToken,
            createdAt: current.createdAt,
            updatedAt: isoTimestamp(),
            userName: current.userName,
            wallImageUrl: snapshot.map(\.wallImageUrl) ?? current.wallImageUrl,
            wallImageWidth: snapshot.map(\.wallImageWidth) ?? current.wallImageWidth,
            wallImageHeight: snapshot.map(\.wallImageHeight) ?? current.wallImageHeight,
            likeCount: current.likeCount,
            isLiked: current.isLiked,
            ascents: current.ascents,
            comments: current.comments
        )
        storage.routes[index] = updatedRoute
        return updatedRoute
    }
    func enableSharing(id: String, shareToken: String) async throws -> Route {
        guard isValidShareToken(shareToken) else {
            throw RoutesRepositoryError.invalidShareToken
        }
        guard let index = storage.routes.firstIndex(where: { $0.id == id }) else {
            throw RoutesRepositoryError.notFound
        }
        let current = storage.routes[index]
        let authoritativeToken = current.shareToken ?? shareToken
        guard isValidShareToken(authoritativeToken) else {
            throw RoutesRepositoryError.invalidShareToken
        }
        let updatedRoute = Route(
            id: current.id,
            userId: current.userId,
            wallId: current.wallId,
            name: current.name,
            description: current.description,
            gradeV: current.gradeV,
            gradeFont: current.gradeFont,
            holds: current.holds,
            isPublic: true,
            viewCount: current.viewCount,
            shareToken: authoritativeToken,
            createdAt: current.createdAt,
            updatedAt: isoTimestamp(),
            userName: current.userName,
            wallImageUrl: current.wallImageUrl,
            wallImageWidth: current.wallImageWidth,
            wallImageHeight: current.wallImageHeight,
            likeCount: current.likeCount,
            isLiked: current.isLiked,
            ascents: current.ascents,
            comments: current.comments
        )
        storage.routes[index] = updatedRoute
        return updatedRoute
    }


    func deleteRoute(id: String) async throws {
        guard let index = storage.routes.firstIndex(where: { $0.id == id }) else {
            throw RoutesRepositoryError.notFound
        }
        storage.routes.remove(at: index)
    }
}

#if canImport(Supabase)
import Supabase

struct SupabaseRoutesRepository: RoutesRepository {
    private let client: SupabaseClient?

    static func isConfigured() -> Bool {
        SupabaseConfig.current != nil
    }

    init(client: SupabaseClient?) {
        self.client = client
    }

    @MainActor init() {
        self.init(client: SupabaseClientProvider.client)
    }

    func fetchRoutes(userId: UUID?) async throws -> [Route] {
        guard let client else { return [] }
        let currentUserId = userId?.uuidString ?? ""
        let response = try await fetchRoutesWithFallback(client: client, currentUserId: currentUserId)
        if response.isEmpty {
            return response
        }

        let routeIds = response.map { $0.id }
        let likes: [RouteLikeFull] = try await client.from("route_likes")
            .select("route_id, user_id")
            .in("route_id", values: routeIds)
            .execute()
            .value

        var likesByRoute: [String: [String]] = [:]
        likes.forEach { like in
            likesByRoute[like.routeId, default: []].append(like.userId)
        }

        let wallImageById = (try? await fetchWallImages(
            client: client,
            wallIds: Array(Set(response.map(\.wallId))),
            currentUserId: currentUserId
        )) ?? [:]

        let enriched = response.map { route in
            var enrichedRoute = enrichRouteSnapshot(route, wallImageById: wallImageById)
            let likedBy = likesByRoute[route.id] ?? []
            enrichedRoute.likeCount = likedBy.count
            enrichedRoute.isLiked = currentUserId.isEmpty ? false : likedBy.contains(currentUserId)
            return enrichedRoute
        }

        return enriched
    }

    func fetchRouteByShareToken(_ token: String) async throws -> Route {
        guard isValidShareToken(token) else {
            throw RoutesRepositoryError.invalidShareToken
        }
        guard let client else {
            throw RoutesRepositoryError.unavailable
        }

        let routes: [Route]
        do {
            routes = try await client.from("routes")
                .select("*, ascents(*), comments(*)")
                .eq("share_token", value: token)
                .eq("is_public", value: true)
                .limit(1)
                .execute()
                .value
        } catch {
            let fallbackRoutes: [RouteWithoutComments] = try await client.from("routes")
                .select("*, ascents(*)")
                .eq("share_token", value: token)
                .eq("is_public", value: true)
                .limit(1)
                .execute()
                .value
            routes = fallbackRoutes.map { $0.asRoute() }
        }

        guard let route = routes.first else {
            throw RoutesRepositoryError.notFound
        }

        let currentUserId = (try? await client.auth.session.user.id.uuidString) ?? ""
        let likes: [RouteLikeFull] = (try? await client.from("route_likes")
            .select("route_id, user_id")
            .eq("route_id", value: route.id)
            .execute()
            .value) ?? []
        let wallImageById = (try? await fetchWallImages(
            client: client,
            wallIds: [route.wallId],
            currentUserId: currentUserId
        )) ?? [:]
        var enriched = enrichRouteSnapshot(route, wallImageById: wallImageById)
        enriched.likeCount = likes.count
        enriched.isLiked = !currentUserId.isEmpty && likes.contains { $0.userId == currentUserId }
        return enriched
    }

    func createRoute(_ draft: RouteDraft) async throws -> Route {
        guard let client else {
            throw RoutesRepositoryError.unavailable
        }

        let routeId = UUID().uuidString
        let timestamp = isoTimestamp()
        let shareToken = generateShareToken()
        let payload: [String: AnyEncodable] = [
            "id": AnyEncodable(routeId),
            "user_id": AnyEncodable(draft.userId),
            "user_name": AnyEncodable(draft.userName),
            "wall_id": AnyEncodable(draft.wallId),
            "wall_image_url": AnyEncodable(draft.wallImageUrl),
            "name": AnyEncodable(draft.name),
            "description": AnyEncodable(draft.description),
            "grade_v": AnyEncodable(draft.gradeV),
            "grade_font": AnyEncodable(draft.gradeFont),
            "holds": AnyEncodable(draft.holds),
            "is_public": AnyEncodable(draft.isPublic),
            "view_count": AnyEncodable(0),
            "share_token": AnyEncodable(shareToken),
            "created_at": AnyEncodable(timestamp),
            "updated_at": AnyEncodable(timestamp),
            "wall_image_width": AnyEncodable(draft.wallImageWidth),
            "wall_image_height": AnyEncodable(draft.wallImageHeight)
        ]
        _ = try await client.from("routes")
            .insert(payload)
            .execute()

        return buildRoute(
            id: routeId,
            draft: draft,
            shareToken: shareToken,
            timestamp: timestamp
        )
    }

    func updateRoute(id: String, patch: RoutePatch) async throws -> Route {
        guard let client else {
            throw RoutesRepositoryError.unavailable
        }

        let payload = patchPayload(from: patch)
        let updatedRoutes: [Route] = try await client.from("routes")
            .update(payload)
            .eq("id", value: id)
            .select("*, ascents(*), comments(*)")
            .execute()
            .value

        guard let updatedRoute = updatedRoutes.first else {
            throw RoutesRepositoryError.notFound
        }
        return updatedRoute
    }

    func enableSharing(id: String, shareToken: String) async throws -> Route {
        guard isValidShareToken(shareToken) else {
            throw RoutesRepositoryError.invalidShareToken
        }
        guard let client else {
            throw RoutesRepositoryError.unavailable
        }

        let publishPayload: [String: AnyEncodable] = [
            "is_public": AnyEncodable(true),
            "share_token": AnyEncodable(shareToken),
            "updated_at": AnyEncodable(isoTimestamp())
        ]
        let conditionalRoutes: [Route] = try await client.from("routes")
            .update(publishPayload)
            .eq("id", value: id)
            .is("share_token", value: nil)
            .select("*, ascents(*), comments(*)")
            .execute()
            .value
        if let route = conditionalRoutes.first {
            guard let token = route.shareToken, isValidShareToken(token) else {
                throw RoutesRepositoryError.invalidShareToken
            }
            return route
        }

        let currentRoutes: [Route] = try await client.from("routes")
            .select("*, ascents(*), comments(*)")
            .eq("id", value: id)
            .execute()
            .value
        guard let currentRoute = currentRoutes.first else {
            throw RoutesRepositoryError.notFound
        }
        guard let authoritativeToken = currentRoute.shareToken,
              isValidShareToken(authoritativeToken) else {
            throw RoutesRepositoryError.invalidShareToken
        }

        let existingTokenPayload: [String: AnyEncodable] = [
            "is_public": AnyEncodable(true),
            "share_token": AnyEncodable(authoritativeToken),
            "updated_at": AnyEncodable(isoTimestamp())
        ]
        let publishedRoutes: [Route] = try await client.from("routes")
            .update(existingTokenPayload)
            .eq("id", value: id)
            .eq("share_token", value: authoritativeToken)
            .select("*, ascents(*), comments(*)")
            .execute()
            .value
        if let route = publishedRoutes.first {
            guard let token = route.shareToken, isValidShareToken(token) else {
                throw RoutesRepositoryError.invalidShareToken
            }
            return route
        }

        let latestRoutes: [Route] = try await client.from("routes")
            .select("*, ascents(*), comments(*)")
            .eq("id", value: id)
            .execute()
            .value
        guard let latestRoute = latestRoutes.first else {
            throw RoutesRepositoryError.sharingConflict
        }
        guard let latestToken = latestRoute.shareToken else {
            throw RoutesRepositoryError.sharingConflict
        }
        guard isValidShareToken(latestToken) else {
            throw RoutesRepositoryError.invalidShareToken
        }
        guard latestRoute.isPublic else {
            throw RoutesRepositoryError.sharingConflict
        }
        return latestRoute
    }

    func deleteRoute(id: String) async throws {
        guard let client else {
            throw RoutesRepositoryError.unavailable
        }

        let deletedRoutes: [RouteIdentifierRecord] = try await client.from("routes")
            .delete()
            .eq("id", value: id)
            .select("id")
            .execute()
            .value

        guard !deletedRoutes.isEmpty else {
            throw RoutesRepositoryError.notFound
        }
    }

    private func fetchWallImages(client: SupabaseClient, wallIds: [String], currentUserId: String) async throws -> [String: WallImageRecord] {
        let validWallIds = wallIds.filter(isUUID)
        guard !validWallIds.isEmpty else { return [:] }

        var query = client.from("walls")
            .select("id, image_url, image_width, image_height")
            .in("id", values: validWallIds)

        if currentUserId.isEmpty {
            query = query.eq("is_public", value: true)
        } else {
            query = query.or("is_public.eq.true,user_id.eq.\(currentUserId)")
        }

        let walls: [WallImageRecord] = try await query.execute().value
        return Dictionary(uniqueKeysWithValues: walls.map { ($0.id, $0) })
    }

    func enrichRouteSnapshot(_ route: Route, wallImageById: [String: WallImageRecord]) -> Route {
        guard let wall = wallImageById[route.wallId] else { return route }
        let normalizedRouteURL = route.normalizedWallImageUrl
        let normalizedWallURL = normalizedRemoteImageURLString(wall.imageUrl)
        let useWallSnapshot = normalizedRouteURL == nil
        let useWallDimensions = useWallSnapshot || normalizedRouteURL == normalizedWallURL
        guard useWallSnapshot || useWallDimensions else { return route }
        return Route(
            id: route.id,
            userId: route.userId,
            wallId: route.wallId,
            name: route.name,
            description: route.description,
            gradeV: route.gradeV,
            gradeFont: route.gradeFont,
            holds: route.holds,
            isPublic: route.isPublic,
            viewCount: route.viewCount,
            shareToken: route.shareToken,
            createdAt: route.createdAt,
            updatedAt: route.updatedAt,
            userName: route.userName,
            wallImageUrl: useWallSnapshot ? normalizedWallURL : route.wallImageUrl,
            wallImageWidth: useWallSnapshot ? wall.imageWidth : (useWallDimensions ? (route.wallImageWidth ?? wall.imageWidth) : route.wallImageWidth),
            wallImageHeight: useWallSnapshot ? wall.imageHeight : (useWallDimensions ? (route.wallImageHeight ?? wall.imageHeight) : route.wallImageHeight),
            likeCount: route.likeCount,
            isLiked: route.isLiked,
            ascents: route.ascents,
            comments: route.comments
        )
    }

    private func fetchRoutesWithFallback(client: SupabaseClient, currentUserId: String) async throws -> [Route] {
        let visibility = currentUserId.isEmpty ? "is_public.eq.true" : "is_public.eq.true,user_id.eq.\(currentUserId)"
        do {
            return try await client.from("routes")
                .select("*, ascents(*), comments(*)")
                .or(visibility)
                .order("created_at", ascending: false)
                .execute()
                .value
        } catch {
            do {
                let routes: [RouteWithoutComments] = try await client.from("routes")
                    .select("*, ascents(*)")
                    .or(visibility)
                    .order("created_at", ascending: false)
                    .execute()
                    .value
                return routes.map { $0.asRoute() }
            } catch {
                let routes: [RoutePlainRecord] = try await client.from("routes")
                    .select("*")
                    .or(visibility)
                    .order("created_at", ascending: false)
                    .execute()
                    .value
                return routes.map { $0.asRoute() }
            }
        }
    }
}
#endif

enum AppServices {
    static let routesRepository: any RoutesRepository = {
        #if DEBUG
        if AppLaunchConfiguration.isUITestFixture {
            return MockRoutesRepository(fixture: true)
        }
        #endif
        #if canImport(Supabase)
        if SupabaseRoutesRepository.isConfigured() {
            return SupabaseRoutesRepository(client: SupabaseClientProvider.client)
        }
        #endif
        return MockRoutesRepository()
    }()

    static let profileRepository: any ProfileRepository = {
        #if DEBUG
        if AppLaunchConfiguration.isUITestFixture {
            return MockProfileRepository(
                profile: Profile(
                    id: "11111111-1111-4111-8111-111111111111",
                    username: "fixture",
                    fullName: "Fixture Climber",
                    avatarUrl: nil,
                    bio: "Deterministic simulator account",
                    createdAt: "2026-01-01T00:00:00Z"
                ),
                metrics: ProfileMetrics(routesCount: 2, likesCount: 20)
            )
        }
        #endif
        return SupabaseProfileRepository(client: SupabaseClientProvider.client)
    }()
    static let wallsRepository: any WallsRepository = {
        #if DEBUG
        if AppLaunchConfiguration.isUITestFixture {
            return MockWallsRepository()
        }
        #endif
        return SupabaseWallsRepository(client: SupabaseClientProvider.client)
    }()
}
struct RouteLikeFull: Codable {
    let routeId: String
    let userId: String

    enum CodingKeys: String, CodingKey {
        case routeId = "route_id"
        case userId = "user_id"
    }
}

struct WallImageRecord: Codable {
    let id: String
    let imageUrl: String?
    let imageWidth: Int?
    let imageHeight: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case imageUrl = "image_url"
        case imageWidth = "image_width"
        case imageHeight = "image_height"
    }
}

struct RouteWithoutComments: Codable {
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
    let wallImageWidth: Int?
    let wallImageHeight: Int?
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
        case wallImageWidth = "wall_image_width"
        case wallImageHeight = "wall_image_height"
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
            wallImageWidth: wallImageWidth,
            wallImageHeight: wallImageHeight,
            likeCount: nil,
            isLiked: nil,
            ascents: ascents,
            comments: []
        )
    }
}

struct RoutePlainRecord: Codable {
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
    let wallImageWidth: Int?
    let wallImageHeight: Int?

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
            wallImageWidth: wallImageWidth,
            wallImageHeight: wallImageHeight,
            likeCount: nil,
            isLiked: nil,
            ascents: [],
            comments: []
        )
    }
}

private struct RouteIdentifierRecord: Codable {
    let id: String
}

private enum RoutesRepositoryError: LocalizedError {
    case unavailable
    case notFound
    case sharingConflict
    case invalidShareToken

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Supabase is not configured for route saves."
        case .notFound:
            return "Route not found."
        case .sharingConflict:
            return "Sharing changed before the link could be published. Retry Share."
        case .invalidShareToken:
            return "The share token is invalid."
        }
    }
}

func isValidShareToken(_ token: String) -> Bool {
    let bytes = token.utf8
    guard !bytes.isEmpty, bytes.count <= 128 else { return false }
    return bytes.allSatisfy { byte in
        (byte >= 48 && byte <= 57)
            || (byte >= 65 && byte <= 90)
            || (byte >= 97 && byte <= 122)
            || byte == 45
            || byte == 95
    }
}

private func buildRoute(id: String, draft: RouteDraft, shareToken: String, timestamp: String) -> Route {
    Route(
        id: id,
        userId: draft.userId,
        wallId: draft.wallId,
        name: draft.name,
        description: draft.description,
        gradeV: draft.gradeV,
        gradeFont: draft.gradeFont,
        holds: draft.holds,
        isPublic: draft.isPublic,
        viewCount: 0,
        shareToken: shareToken,
        createdAt: timestamp,
        updatedAt: timestamp,
        userName: draft.userName,
        wallImageUrl: draft.wallImageUrl,
        wallImageWidth: draft.wallImageWidth,
        wallImageHeight: draft.wallImageHeight,
        likeCount: 0,
        isLiked: false,
        ascents: [],
        comments: []
    )
}

private func isoTimestamp() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
}

private func generateShareToken(length: Int = 10) -> String {
    let characters = Array("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789")
    return String((0..<length).compactMap { _ in characters.randomElement() })
}

private func isUUID(_ value: String) -> Bool {
    UUID(uuidString: value) != nil
}

func patchPayload(from patch: RoutePatch) -> [String: AnyEncodable] {
    var payload: [String: AnyEncodable] = [
        "updated_at": AnyEncodable(isoTimestamp())
    ]

    if let snapshot = patch.wallSnapshot {
        payload["wall_id"] = AnyEncodable(snapshot.wallId)
        payload["wall_image_url"] = AnyEncodable(snapshot.wallImageUrl)
        payload["wall_image_width"] = AnyEncodable(snapshot.wallImageWidth)
        payload["wall_image_height"] = AnyEncodable(snapshot.wallImageHeight)
    }
    if let name = patch.name {
        payload["name"] = AnyEncodable(name)
    }
    if let gradeV = patch.gradeV {
        payload["grade_v"] = AnyEncodable(gradeV)
    }
    if let holds = patch.holds {
        payload["holds"] = AnyEncodable(holds)
    }

    return payload
}
