import Foundation
import Combine
import Supabase
#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class WallsViewModel: ObservableObject {
    @Published var walls: [Wall] = []
    @Published var selectedWallId: String? = nil
    @Published var isLoading = false
    @Published var errorMessage: String? = nil

    @Published var newWallName = ""
    @Published var newWallImageUrl = ""
    @Published var newWallImageData: Data? = nil
    @Published var wallImageRevision = 0

    private let selectionKey = "climbset.selectedWallId"
    private var loadGeneration = 0

    func load(userId: UUID?) async {
        guard let client = SupabaseClientProvider.client else { return }
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
            var query = client.database
                .from("walls")
                .select("*")

            if let userId {
                query = query.or("is_public.eq.true,user_id.eq.\(userId.uuidString)")
            } else {
                query = query.eq("is_public", value: true)
            }

            let response: [Wall] = try await query
                .order("created_at", ascending: false)
                .execute()
                .value
            guard generation == loadGeneration else { return }

            walls = response

            let storedId = UserDefaults.standard.string(forKey: selectionKey)
            if let storedId, response.contains(where: { $0.id == storedId }) {
                selectedWallId = storedId
            } else if let first = response.first {
                selectedWallId = first.id
                UserDefaults.standard.set(first.id, forKey: selectionKey)
            } else {
                selectedWallId = nil
                UserDefaults.standard.removeObject(forKey: selectionKey)
            }
        } catch {
            guard generation == loadGeneration else { return }
            errorMessage = error.localizedDescription
        }
    }

    func selectWall(id: String) {
        selectedWallId = id
        UserDefaults.standard.set(id, forKey: selectionKey)
    }

    func restoreWallSelection(id: String?) {
        selectedWallId = id
        if let id {
            UserDefaults.standard.set(id, forKey: selectionKey)
        } else {
            UserDefaults.standard.removeObject(forKey: selectionKey)
        }
    }

    func addWall(userId: UUID?) async {
        guard let client = SupabaseClientProvider.client else { return }
        let name = newWallName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }

        do {
            let wallId = UUID().uuidString
            var imageUrl = newWallImageUrl.trimmingCharacters(in: .whitespacesAndNewlines)
            let imageDimensions = dimensions(from: newWallImageData)

            if let data = newWallImageData {
                imageUrl = try await uploadWallImage(data: data, wallId: wallId)
            }

            let payload: [String: AnyEncodable] = [
                "id": AnyEncodable(wallId),
                "user_id": AnyEncodable(userId?.uuidString),
                "name": AnyEncodable(name),
                "image_url": AnyEncodable(imageUrl),
                "image_width": AnyEncodable(imageDimensions?.width),
                "image_height": AnyEncodable(imageDimensions?.height),
                "is_public": AnyEncodable(true)
            ]

            _ = try await client.database
                .from("walls")
                .insert(payload)
                .execute()

            newWallName = ""
            newWallImageUrl = ""
            newWallImageData = nil
            selectedWallId = wallId
            UserDefaults.standard.set(wallId, forKey: selectionKey)
            await load(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateWall(id: String, name: String, imageUrl: String?, imageData: Data?, userId: UUID?) async {
        guard let client = SupabaseClientProvider.client else { return }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }

        let originalImageUrl = walls.first(where: { $0.id == id })?.imageUrl
        let requestedImageUrl = imageUrl?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let imageChanged = imageData != nil
            || normalizedRemoteImageURLString(originalImageUrl)
                != normalizedRemoteImageURLString(requestedImageUrl)

        do {
            var updatedImageUrl = requestedImageUrl
            let imageDimensions = dimensions(from: imageData)
            if let data = imageData {
                updatedImageUrl = try await uploadWallImage(data: data, wallId: id)
            }

            var payload: [String: AnyEncodable] = [
                "name": AnyEncodable(trimmedName),
                "image_url": AnyEncodable(updatedImageUrl),
                "updated_at": AnyEncodable(ISO8601DateFormatter().string(from: Date()))
            ]
            if let imageDimensions {
                payload["image_width"] = AnyEncodable(imageDimensions.width)
                payload["image_height"] = AnyEncodable(imageDimensions.height)
            } else if imageChanged {
                payload["image_width"] = AnyEncodable(nil as Int?)
                payload["image_height"] = AnyEncodable(nil as Int?)
            }

            _ = try await client.database
                .from("walls")
                .update(payload)
                .eq("id", value: id)
                .execute()
            await load(userId: userId)
            if imageChanged {
                wallImageRevision += 1
                NotificationCenter.default.post(name: .wallImageDidChange, object: id)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteWall(id: String, userId: UUID?) async {
        guard let client = SupabaseClientProvider.client else { return }
        do {
            _ = try await client.database
                .from("walls")
                .delete()
                .eq("id", value: id)
                .execute()

            var cleanupErrorMessage: String?
            do {
                let files = try await client.storage
                    .from("walls")
                    .list(path: id)
                let paths = files.map { "\(id)/\($0.name)" }
                if !paths.isEmpty {
                    _ = try await client.storage
                        .from("walls")
                        .remove(paths: paths)
                }
            } catch {
                cleanupErrorMessage = error.localizedDescription
            }

            await load(userId: userId)
            if let cleanupErrorMessage, errorMessage == nil {
                errorMessage = "Wall deleted, but image cleanup failed: \(cleanupErrorMessage)"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func uploadWallImage(data: Data, wallId: String) async throws -> String {
        guard let client = SupabaseClientProvider.client else { return "" }
        let path = "\(wallId)/\(UUID().uuidString).jpg"
        let options = FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: true)
        #if canImport(UIKit)
        guard let image = UIImage(data: data),
              let uploadData = image.jpegData(compressionQuality: 0.92) else {
            throw NSError(
                domain: "ClimbSet.WallsViewModel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "The selected wall image could not be read."]
            )
        }
        #else
        let uploadData = data
        #endif
        _ = try await client.storage
            .from("walls")
            .upload(path, data: uploadData, options: options)
        let url = try client.storage
            .from("walls")
            .getPublicURL(path: path)
        return url.absoluteString
    }

    private func dimensions(from data: Data?) -> (width: Int, height: Int)? {
        #if canImport(UIKit)
        guard let data, let image = UIImage(data: data) else { return nil }
        return (width: Int(image.size.width), height: Int(image.size.height))
        #else
        return nil
        #endif
    }
}

extension Notification.Name {
    static let wallImageDidChange = Notification.Name("ClimbSet.wallImageDidChange")
}

struct AnyEncodable: Encodable {
    private let encode: (Encoder) throws -> Void

    init<T: Encodable>(_ wrapped: T?) {
        encode = { encoder in
            var container = encoder.singleValueContainer()
            if let value = wrapped {
                try container.encode(value)
            } else {
                try container.encodeNil()
            }
        }
    }

    func encode(to encoder: Encoder) throws {
        try encode(encoder)
    }
}
