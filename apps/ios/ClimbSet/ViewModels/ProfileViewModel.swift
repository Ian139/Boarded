import Foundation
import SwiftUI
import Combine

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published private(set) var profile: Profile?
    @Published private(set) var selectedUserID: UUID?
    @Published private(set) var points: Int?
    @Published private(set) var routesCount = 0
    @Published private(set) var sendsCount = 0
    @Published private(set) var likesCount = 0
    @Published private(set) var flashedCount = 0
    @Published private(set) var highestGrade: String?
    @Published private(set) var leaderboard: [ProfileLeaderboardEntry] = []
    @Published private(set) var previousClimbs: [ProfileClimbHistoryItem] = []
    @Published private(set) var highlights = ProfileHighlights(bestClimb: nil, longestProject: nil)
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let repository: any ProfileRepository
    private var generation = 0

    init(repository: any ProfileRepository) {
        self.repository = repository
    }

    @MainActor convenience init() {
        self.init(repository: SupabaseProfileRepository())
    }

    func load(userID: UUID?) async {
        generation += 1
        let request = generation
        selectedUserID = userID
        isLoading = true
        errorMessage = nil
        guard let userID else {
            applyEmptyState()
            isLoading = false
            return
        }
        do {
            async let fetchedProfile = repository.fetchProfile(userID: userID)
            async let fetchedLeaderboard = repository.fetchLeaderboard()
            async let fetchedHistory = repository.fetchClimbHistory(userID: userID)
            async let fetchedMetrics = repository.fetchMetrics(userID: userID)
            let (newProfile, newLeaderboard, newHistory, newMetrics) = try await (fetchedProfile, fetchedLeaderboard, fetchedHistory, fetchedMetrics)
            try Task.checkCancellation()
            guard request == generation else { return }
            profile = newProfile
            leaderboard = newLeaderboard
            routesCount = newMetrics.routesCount
            likesCount = newMetrics.likesCount
            applyHistory(newHistory, userID: userID, request: request)
        } catch is CancellationError {
            return
        } catch {
            guard request == generation else { return }
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }

    func selectAccount(userID: UUID) async {
        generation += 1
        let request = generation
        selectedUserID = userID
        isLoading = true
        errorMessage = nil
        do {
            async let fetchedProfile = repository.fetchProfile(userID: userID)
            async let fetchedHistory = repository.fetchClimbHistory(userID: userID)
            async let fetchedMetrics = repository.fetchMetrics(userID: userID)
            let (newProfile, newHistory, newMetrics) = try await (fetchedProfile, fetchedHistory, fetchedMetrics)
            try Task.checkCancellation()
            guard request == generation else { return }
            profile = newProfile
            routesCount = newMetrics.routesCount
            likesCount = newMetrics.likesCount
            applyHistory(newHistory, userID: userID, request: request)
        } catch is CancellationError {
            return
        } catch {
            guard request == generation else { return }
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }

    func retry() async { await load(userID: selectedUserID) }

    func myProfile(currentUserID: UUID?) async {
        guard let currentUserID else { return }
        await selectAccount(userID: currentUserID)
    }

    func syncProfileFromSession(currentUserID: UUID?, profile: Profile?) {
        guard let currentUserID, selectedUserID == currentUserID, let profile else { return }
        self.profile = profile
    }

    private func applyHistory(_ history: [ProfileClimbHistoryItem], userID: UUID, request: Int) {
        guard request == generation else { return }
        previousClimbs = history.sorted {
            let lhs = $0.completedAt ?? .distantPast
            let rhs = $1.completedAt ?? .distantPast
            return lhs == rhs ? $0.id < $1.id : lhs > rhs
        }
        let records = previousClimbs.map { climb in
            ProfileScoringRecord(
                id: climb.id,
                userId: userID.uuidString,
                routeId: climb.routeId,
                routeName: climb.routeName,
                routeGrade: climb.route?.gradeV,
                ascentGrade: climb.grade,
                flashed: climb.flashed,
                completedAt: climb.completedAt,
                route: climb.route
            )
        }
        let calculated = ProfileStatistics.calculate(records: records, selectedUserID: userID.uuidString)
        points = leaderboard.first(where: { $0.id == userID.uuidString })?.points ?? calculated.points
        sendsCount = calculated.sendsCount
        flashedCount = calculated.flashedCount
        highestGrade = calculated.highestGrade
        highlights = calculated.highlights
        isLoading = false
    }

    private func applyEmptyState() {
        profile = nil
        points = nil
        routesCount = 0
        sendsCount = 0
        likesCount = 0
        flashedCount = 0
        highestGrade = nil
        leaderboard = []
        previousClimbs = []
        highlights = ProfileHighlights(bestClimb: nil, longestProject: nil)
        errorMessage = nil
    }
}
