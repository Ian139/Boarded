import Foundation
import SwiftUI
import Combine
import Supabase

@MainActor
final class AppSession: ObservableObject {
    @Published var userId: UUID? = nil
    @Published var userEmail: String? = nil
    @Published var profile: Profile? = nil
    @Published var isLoading = false
    @Published var errorMessage: String? = nil

    var displayName: String {
        profile?.fullName
        ?? profile?.username
        ?? userEmail
        ?? "Climber"
    }

    func load() async {
        guard let client = SupabaseClientProvider.client else {
            userId = nil
            userEmail = nil
            profile = nil
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let session = try await client.auth.session
            userId = session.user.id
            userEmail = session.user.email
            await fetchProfile(userId: session.user.id)
        } catch {
            userId = nil
            userEmail = nil
            profile = nil
        }
    }

    func signIn(email: String, password: String) async {
        guard let client = SupabaseClientProvider.client else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            _ = try await client.auth.signIn(email: email, password: password)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signUp(email: String, password: String) async {
        guard let client = SupabaseClientProvider.client else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            _ = try await client.auth.signUp(email: email, password: password)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        guard let client = SupabaseClientProvider.client else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            try await client.auth.signOut()
            userId = nil
            userEmail = nil
            profile = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func fetchProfile(userId: UUID) async {
        guard let client = SupabaseClientProvider.client else { return }
        do {
            let profiles: [Profile] = try await client.database
                .from("profiles")
                .select("*")
                .eq("id", value: userId.uuidString)
                .limit(1)
                .execute()
                .value
            profile = profiles.first
        } catch {
            profile = nil
        }
    }

    func updateProfile(fullName: String?, username: String?, bio: String?) async {
        guard let client = SupabaseClientProvider.client, let userId else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let payload = ProfileUpdate(
            id: userId.uuidString,
            fullName: fullName?.trimmingCharacters(in: .whitespacesAndNewlines),
            username: username?.trimmingCharacters(in: .whitespacesAndNewlines),
            bio: bio?.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        do {
            _ = try await client.database
                .from("profiles")
                .upsert(payload)
                .execute()
            await fetchProfile(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
