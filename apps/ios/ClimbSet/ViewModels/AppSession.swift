import Foundation
import Combine
import Supabase

@MainActor
final class AppSession: ObservableObject {
    @Published var userId: UUID? = nil
    @Published var userEmail: String? = nil
    @Published var profile: Profile? = nil
    @Published var isLoading = false
    @Published var errorMessage: String? = nil

    private let fixture: Bool

    init(fixture: Bool = false) {
        self.fixture = fixture
    }

    var displayName: String {
        profile?.fullName
        ?? profile?.username
        ?? userEmail
        ?? "Climber"
    }

    private var sessionGeneration = 0

    func load() async {
        #if DEBUG
        if fixture {
            userId = UUID(uuidString: "11111111-1111-4111-8111-111111111111")
            userEmail = "fixture@climbset.test"
            profile = Profile(
                id: "11111111-1111-4111-8111-111111111111",
                username: "fixture",
                fullName: "Fixture Climber",
                avatarUrl: nil,
                bio: "Deterministic simulator account",
                createdAt: "2026-01-01T00:00:00Z"
            )
            isLoading = false
            return
        }
        #endif
        sessionGeneration += 1
        let generation = sessionGeneration
        guard let client = SupabaseClientProvider.client else {
            userId = nil
            userEmail = nil
            profile = nil
            return
        }
        isLoading = true
        defer {
            if generation == sessionGeneration {
                isLoading = false
            }
        }
        do {
            let session = try await client.auth.session
            guard generation == sessionGeneration else { return }
            userId = session.user.id
            userEmail = session.user.email
            await fetchProfile(userId: session.user.id, generation: generation)
        } catch {
            guard generation == sessionGeneration else { return }
            userId = nil
            userEmail = nil
            profile = nil
        }
    }

    func signIn(email: String, password: String) async {
        #if DEBUG
        if fixture {
            await load()
            return
        }
        #endif
        guard let client = SupabaseClientProvider.client else { return }
        sessionGeneration += 1
        let generation = sessionGeneration
        isLoading = true
        errorMessage = nil
        defer {
            if generation == sessionGeneration {
                isLoading = false
            }
        }
        do {
            _ = try await client.auth.signIn(email: email, password: password)
            guard generation == sessionGeneration else { return }
            await load()
        } catch {
            guard generation == sessionGeneration else { return }
            errorMessage = error.localizedDescription
        }
    }

    func signUp(email: String, password: String) async {
        #if DEBUG
        if fixture {
            await load()
            return
        }
        #endif
        guard let client = SupabaseClientProvider.client else { return }
        sessionGeneration += 1
        let generation = sessionGeneration
        isLoading = true
        errorMessage = nil
        defer {
            if generation == sessionGeneration {
                isLoading = false
            }
        }
        do {
            _ = try await client.auth.signUp(email: email, password: password)
            guard generation == sessionGeneration else { return }
            await load()
        } catch {
            guard generation == sessionGeneration else { return }
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        #if DEBUG
        if fixture {
            sessionGeneration += 1
            userId = nil
            userEmail = nil
            profile = nil
            errorMessage = nil
            isLoading = false
            return
        }
        #endif
        guard let client = SupabaseClientProvider.client else { return }
        sessionGeneration += 1
        let generation = sessionGeneration
        userId = nil
        userEmail = nil
        profile = nil
        isLoading = true
        defer {
            if generation == sessionGeneration {
                isLoading = false
            }
        }
        do {
            try await client.auth.signOut()
        } catch {
            guard generation == sessionGeneration else { return }
            errorMessage = error.localizedDescription
        }
    }

    private func fetchProfile(userId: UUID, generation: Int? = nil) async {
        guard let client = SupabaseClientProvider.client else { return }
        do {
            let profiles: [Profile] = try await client.from("profiles")
                .select("*")
                .eq("id", value: userId.uuidString)
                .limit(1)
                .execute()
                .value
            guard generation == nil || generation == sessionGeneration,
                  self.userId == userId else {
                return
            }
            profile = profiles.first
        } catch {
            guard generation == nil || generation == sessionGeneration,
                  self.userId == userId else {
                return
            }
            profile = nil
        }
    }

    func updateProfile(fullName: String?, username: String?, bio: String?) async {
        #if DEBUG
        if fixture, let userId {
            profile = Profile(
                id: userId.uuidString,
                username: username?.trimmingCharacters(in: .whitespacesAndNewlines),
                fullName: fullName?.trimmingCharacters(in: .whitespacesAndNewlines),
                avatarUrl: profile?.avatarUrl,
                bio: bio?.trimmingCharacters(in: .whitespacesAndNewlines),
                createdAt: profile?.createdAt
            )
            return
        }
        #endif
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
            _ = try await client.from("profiles")
                .upsert(payload)
                .execute()
            await fetchProfile(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
