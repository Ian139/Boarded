import Foundation
import SwiftUI
import Supabase

@MainActor
final class WallsViewModel: ObservableObject {
    @Published var walls: [Wall] = []
    @Published var selectedWallId: String? = nil
    @Published var isLoading = false
    @Published var errorMessage: String? = nil

    @Published var newWallName = ""
    @Published var newWallImageUrl = ""

    func load(userId: UUID?) async {
        guard let client = SupabaseClientProvider.client else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            var query = client.database
                .from("walls")
                .select("*")
                .order("created_at", ascending: false)

            if let userId {
                query = query.or("is_public.eq.true,user_id.eq.\(userId.uuidString)")
            } else {
                query = query.eq("is_public", value: true)
            }

            let response: [Wall] = try await query.execute().value
            walls = response

            if selectedWallId == nil, let first = response.first {
                selectedWallId = first.id
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func selectWall(id: String) {
        selectedWallId = id
    }

    func addWall(userId: UUID?) async {
        guard let client = SupabaseClientProvider.client else { return }
        let name = newWallName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }

        do {
            let payload: [String: AnyEncodable] = [
                "id": AnyEncodable(UUID().uuidString),
                "user_id": AnyEncodable(userId?.uuidString),
                "name": AnyEncodable(name),
                "image_url": AnyEncodable(newWallImageUrl.trimmingCharacters(in: .whitespacesAndNewlines)),
                "is_public": AnyEncodable(true)
            ]

            _ = try await client.database
                .from("walls")
                .insert(payload)
                .execute()

            newWallName = ""
            newWallImageUrl = ""
            await load(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
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
