import Foundation
import Supabase
#if canImport(UIKit)
import UIKit
#endif

protocol WallsRepository {
    var selectionKey: String? { get }
    func fetchWalls(userId: UUID?) async throws -> [Wall]?
    func addWall(userId: UUID?, name: String, imageUrl: String, imageData: Data?) async throws -> Wall
    func updateWall(id: String, userId: UUID?, name: String, imageUrl: String, imageData: Data?, originalImageUrl: String?) async throws
    func deleteWall(id: String) async throws
}

enum WallsRepositoryError: LocalizedError {
    case unavailable
    case invalidName
    case invalidImage
    case notFound
    case unauthenticatedUpload

    var errorDescription: String? {
        switch self {
        case .unavailable: return "Wall storage is unavailable."
        case .invalidName: return "Wall name is required."
        case .invalidImage: return "The selected wall image could not be read."
        case .notFound: return "The wall could not be found."
        case .unauthenticatedUpload: return "Sign in before uploading a wall image."
        }
    }
}

struct MockWallsRepository: WallsRepository {
    private final class Storage {
        var walls: [Wall]
        init(walls: [Wall]) { self.walls = walls }
    }

    private let storage: Storage
    let selectionKey: String? = nil
    init(walls: [Wall] = [
        Wall(id: "wall-1", userId: "11111111-1111-4111-8111-111111111111", name: "Fixture Slab", description: "Deterministic simulator wall", imageUrl: "fixture://default-wall", imageWidth: 1200, imageHeight: 800, isPublic: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"),
        Wall(id: "wall-2", userId: "11111111-1111-4111-8111-111111111111", name: "Fixture Cave", description: "Second deterministic simulator wall", imageUrl: "fixture://default-wall", imageWidth: 1200, imageHeight: 800, isPublic: true, createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z")
    ]) {
        storage = Storage(walls: walls)
    }

    func fetchWalls(userId: UUID?) async throws -> [Wall]? { storage.walls }

    func addWall(userId: UUID?, name: String, imageUrl: String, imageData: Data?) async throws -> Wall {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { throw WallsRepositoryError.invalidName }
        guard imageData == nil || userId != nil else { throw WallsRepositoryError.unauthenticatedUpload }
        let id = "fixture-wall-\(storage.walls.count + 1)-\(UUID().uuidString)"
        let wall = Wall(id: id, userId: userId?.uuidString, name: trimmedName, description: nil, imageUrl: imageUrl.isEmpty ? nil : imageUrl, imageWidth: nil, imageHeight: nil, isPublic: true, createdAt: "2026-01-03T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z")
        storage.walls.append(wall)
        return wall
    }

    func updateWall(id: String, userId: UUID?, name: String, imageUrl: String, imageData: Data?, originalImageUrl: String?) async throws {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { throw WallsRepositoryError.invalidName }
        guard imageData == nil || userId != nil else { throw WallsRepositoryError.unauthenticatedUpload }
        guard let index = storage.walls.firstIndex(where: { $0.id == id }) else { throw WallsRepositoryError.notFound }
        let current = storage.walls[index]
        let updated = Wall(id: current.id, userId: current.userId, name: trimmedName, description: current.description, imageUrl: imageUrl.isEmpty ? nil : imageUrl, imageWidth: current.imageWidth, imageHeight: current.imageHeight, isPublic: current.isPublic, createdAt: current.createdAt, updatedAt: "2026-01-03T00:00:00Z")
        storage.walls[index] = updated
    }

    func deleteWall(id: String) async throws {
        guard let index = storage.walls.firstIndex(where: { $0.id == id }) else { throw WallsRepositoryError.notFound }
        storage.walls.remove(at: index)
    }
}

struct SupabaseWallsRepository: WallsRepository {
    private let client: SupabaseClient?
    let selectionKey: String? = "climbset.selectedWallId"

    init(client: SupabaseClient?) {
        self.client = client
    }

    @MainActor init() {
        self.init(client: SupabaseClientProvider.client)
    }

    func fetchWalls(userId: UUID?) async throws -> [Wall]? {
        guard let client else { return nil }
        var query = client.from("walls").select("*")
        if let userId {
            query = query.or("is_public.eq.true,user_id.eq.\(userId.uuidString)")
        } else {
            query = query.eq("is_public", value: true)
        }
        return try await query.order("created_at", ascending: false).execute().value
    }

    func addWall(userId: UUID?, name: String, imageUrl: String, imageData: Data?) async throws -> Wall {
        guard let client else { throw WallsRepositoryError.unavailable }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { throw WallsRepositoryError.invalidName }
        guard imageData == nil || userId != nil else { throw WallsRepositoryError.unauthenticatedUpload }
        let wallId = UUID().uuidString.lowercased()
        var finalImageUrl = imageUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let imageDimensions = dimensions(from: imageData)
        if let imageData, let userId {
            finalImageUrl = try await uploadWallImage(data: imageData, userId: userId, wallId: wallId, client: client)
        }
        let payload: [String: AnyEncodable] = [
            "id": AnyEncodable(wallId), "user_id": AnyEncodable(userId?.uuidString), "name": AnyEncodable(trimmedName),
            "image_url": AnyEncodable(finalImageUrl), "image_width": AnyEncodable(imageDimensions?.width), "image_height": AnyEncodable(imageDimensions?.height), "is_public": AnyEncodable(true)
        ]
        _ = try await client.from("walls").insert(payload).execute()
        guard let wall = try await fetchWalls(userId: userId)?.first(where: { $0.id == wallId }) else { throw WallsRepositoryError.notFound }
        return wall
    }

    func updateWall(id: String, userId: UUID?, name: String, imageUrl: String, imageData: Data?, originalImageUrl: String?) async throws {
        guard let client else { throw WallsRepositoryError.unavailable }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { throw WallsRepositoryError.invalidName }
        guard imageData == nil || userId != nil else { throw WallsRepositoryError.unauthenticatedUpload }
        let requestedImageUrl = imageUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let imageChanged = imageData != nil || normalizedRemoteImageURLString(originalImageUrl) != normalizedRemoteImageURLString(requestedImageUrl)
        var finalImageUrl = requestedImageUrl
        let imageDimensions = dimensions(from: imageData)
        if let imageData, let userId {
            finalImageUrl = try await uploadWallImage(data: imageData, userId: userId, wallId: id, client: client)
        }
        var payload: [String: AnyEncodable] = ["name": AnyEncodable(trimmedName), "image_url": AnyEncodable(finalImageUrl), "updated_at": AnyEncodable(ISO8601DateFormatter().string(from: Date()))]
        if let imageDimensions {
            payload["image_width"] = AnyEncodable(imageDimensions.width)
            payload["image_height"] = AnyEncodable(imageDimensions.height)
        } else if imageChanged {
            payload["image_width"] = AnyEncodable(nil as Int?)
            payload["image_height"] = AnyEncodable(nil as Int?)
        }
        _ = try await client.from("walls").update(payload).eq("id", value: id).execute()
    }

    func deleteWall(id: String) async throws {
        guard let client else { throw WallsRepositoryError.unavailable }
        _ = try await client.from("walls").delete().eq("id", value: id).execute()
    }

    private func uploadWallImage(data: Data, userId: UUID, wallId: String, client: SupabaseClient) async throws -> String {
        #if canImport(UIKit)
        guard let image = UIImage(data: data), let uploadData = image.jpegData(compressionQuality: 0.92) else { throw WallsRepositoryError.invalidImage }
        #else
        let uploadData = data
        #endif
        let path = wallUploadObjectPath(userId: userId, wallId: wallId, fileName: "\(UUID().uuidString).jpg")
        _ = try await client.storage.from("walls").upload(path, data: uploadData, options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: true))
        return try client.storage.from("walls").getPublicURL(path: path).absoluteString
    }

    private func dimensions(from data: Data?) -> (width: Int, height: Int)? {
        #if canImport(UIKit)
        guard let data, let image = UIImage(data: data) else { return nil }
        return (Int(image.size.width), Int(image.size.height))
        #else
        return nil
        #endif
    }
}

func wallUploadObjectPath(userId: UUID, wallId: String, fileName: String) -> String {
    "\(userId.uuidString.lowercased())/\(wallId)/\(fileName)"
}
