import Foundation
import SwiftUI
import Combine
import Supabase

@MainActor
final class CommentsViewModel: ObservableObject {
    @Published var comments: [Comment] = []
    @Published var isLoading = false
    @Published var errorMessage: String? = nil
    @Published var newComment = ""
    @Published var isBeta = false

    private let routeId: String

    init(routeId: String) {
        self.routeId = routeId
    }

    func load() async {
        guard let client = SupabaseClientProvider.client else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response: [Comment] = try await client.database
                .from("comments")
                .select("*")
                .eq("route_id", value: routeId)
                .order("created_at", ascending: true)
                .execute()
                .value
            comments = response
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    struct CommentInsert: Encodable {
        let id: String
        let routeId: String
        let userId: String?
        let userName: String
        let content: String
        let isBeta: Bool

        enum CodingKeys: String, CodingKey {
            case id
            case routeId = "route_id"
            case userId = "user_id"
            case userName = "user_name"
            case content
            case isBeta = "is_beta"
        }
    }

    func postComment(userId: UUID?, userName: String) async {
        guard let client = SupabaseClientProvider.client else { return }
        let trimmed = newComment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let payload = CommentInsert(
                id: UUID().uuidString,
                routeId: routeId,
                userId: userId?.uuidString,
                userName: userName,
                content: trimmed,
                isBeta: isBeta
            )
            _ = try await client.database
                .from("comments")
                .insert(payload)
                .execute()
            newComment = ""
            isBeta = false
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteComment(id: String) async {
        guard let client = SupabaseClientProvider.client else { return }
        do {
            _ = try await client.database
                .from("comments")
                .delete()
                .eq("id", value: id)
                .execute()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
