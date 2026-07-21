import Foundation
import Combine

@MainActor
final class WallsViewModel: ObservableObject {
    @Published var walls: [Wall] = []
    @Published var selectedWallId: String? = nil
    @Published var isLoading = false
    @Published var errorMessage: String? = nil

    private let repository: any WallsRepository

    @MainActor convenience init() {
        self.init(repository: SupabaseWallsRepository())
    }

    init(repository: any WallsRepository) {
        self.repository = repository
    }

    @Published var newWallName = ""
    @Published var newWallImageUrl = ""
    @Published var newWallImageData: Data? = nil
    @Published var wallImageRevision = 0

    private var selectionKey: String? { repository.selectionKey }
    private var loadGeneration = 0

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
            guard let response = try await repository.fetchWalls(userId: userId) else { return }
            guard generation == loadGeneration else { return }

            walls = response

            guard let selectionKey else {
                if let selectedWallId,
                   response.contains(where: { $0.id == selectedWallId }) {
                    return
                }
                selectedWallId = response.first?.id
                return
            }
            let storedId = UserDefaults.standard.string(forKey: selectionKey)
            if let storedId, response.contains(where: { $0.id == storedId }) {
                selectedWallId = storedId
            } else if let firstWall = response.first {
                selectedWallId = firstWall.id
                UserDefaults.standard.set(firstWall.id, forKey: selectionKey)
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
        if let selectionKey {
            UserDefaults.standard.set(id, forKey: selectionKey)
        }
    }

    func restoreWallSelection(id: String?) {
        selectedWallId = id
        guard let selectionKey else { return }
        if let id {
            UserDefaults.standard.set(id, forKey: selectionKey)
        } else {
            UserDefaults.standard.removeObject(forKey: selectionKey)
        }
    }

    func addWall(userId: UUID?) async {
        let name = newWallName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            let wall = try await repository.addWall(
                userId: userId,
                name: name,
                imageUrl: newWallImageUrl.trimmingCharacters(in: .whitespacesAndNewlines),
                imageData: newWallImageData
            )
            newWallName = ""
            newWallImageUrl = ""
            newWallImageData = nil
            selectedWallId = wall.id
            if let selectionKey {
                UserDefaults.standard.set(wall.id, forKey: selectionKey)
            }
            await load(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateWall(id: String, name: String, imageUrl: String?, imageData: Data?, userId: UUID?) async {
        let originalImageUrl = walls.first(where: { $0.id == id })?.imageUrl
        let requestedImageUrl = imageUrl?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let imageChanged = imageData != nil
            || normalizedRemoteImageURLString(originalImageUrl)
                != normalizedRemoteImageURLString(requestedImageUrl)
        do {
            try await repository.updateWall(
                id: id,
                userId: userId,
                name: name,
                imageUrl: requestedImageUrl,
                imageData: imageData,
                originalImageUrl: originalImageUrl
            )
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
        do {
            try await repository.deleteWall(id: id)
            await load(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
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
