import XCTest
@testable import ClimbSet

final class ProfileStatisticsTests: XCTestCase {
    private let userID = "00000000-0000-0000-0000-000000000001"

    private func record(
        id: String,
        userID: String = "00000000-0000-0000-0000-000000000001",
        name: String = "Climber",
        grade: String?,
        date: Date,
        attempts: Int? = nil,
        firstAttempt: Date? = nil
    ) -> ProfileScoringRecord {
        ProfileScoringRecord(
            id: id,
            userId: userID,
            userName: name,
            routeId: "route-\(id)",
            routeName: "Route \(id)",
            routeGrade: grade,
            completedAt: date,
            attemptCount: attempts,
            firstAttemptAt: firstAttempt
        )
    }

    func testGradeOrderingKeepsUnknownBelowKnown() {
        XCTAssertEqual(ProfileStatistics.gradeRank("VB"), 0)
        XCTAssertEqual(ProfileStatistics.gradeRank("V0"), 1)
        XCTAssertEqual(ProfileStatistics.gradeRank("V17"), 18)
        XCTAssertEqual(ProfileStatistics.gradeRank("not-a-grade"), -1)

        let now = Date(timeIntervalSince1970: 100)
        let result = ProfileStatistics.calculate(
            records: [
                record(id: "unknown", grade: "?", date: now),
                record(id: "v3", grade: "V3", date: now.addingTimeInterval(1))
            ],
            selectedUserID: userID
        )
        XCTAssertEqual(result.highestGrade, "V3")
    }

    func testLeaderboardTieBreaksNameThenUUIDAndLeavesUnsupportedPointsNil() {
        let date = Date(timeIntervalSince1970: 100)
        let records = [
            record(id: "a", userID: "00000000-0000-0000-0000-000000000003", name: "alex", grade: "V2", date: date),
            record(id: "b", userID: "00000000-0000-0000-0000-000000000002", name: "Alex", grade: "V2", date: date),
            record(id: "c", userID: userID, name: "Zed", grade: "V2", date: date)
        ]
        let result = ProfileStatistics.calculate(records: records, selectedUserID: userID)
        XCTAssertEqual(result.leaderboard.map(\.displayName), ["Alex", "alex", "Zed"])
        XCTAssertTrue(result.leaderboard.allSatisfy { $0.points == nil })
    }

    func testBestClimbUsesGradeThenNewestCompletion() {
        let result = ProfileStatistics.calculate(
            records: [
                record(id: "old-high", grade: "V5", date: Date(timeIntervalSince1970: 10)),
                record(id: "new-low", grade: "V3", date: Date(timeIntervalSince1970: 30)),
                record(id: "new-high", grade: "V5", date: Date(timeIntervalSince1970: 40))
            ],
            selectedUserID: userID
        )
        XCTAssertEqual(result.highlights.bestClimb?.id, "new-high")
    }

    func testLongestProjectUsesAttemptsThenDurationThenNewest() {
        let result = ProfileStatistics.calculate(
            records: [
                record(id: "short", grade: "V3", date: Date(timeIntervalSince1970: 30), attempts: 3, firstAttempt: Date(timeIntervalSince1970: 20)),
                record(id: "long", grade: "V2", date: Date(timeIntervalSince1970: 40), attempts: 3, firstAttempt: Date(timeIntervalSince1970: 10)),
                record(id: "more", grade: "V1", date: Date(timeIntervalSince1970: 20), attempts: 4, firstAttempt: Date(timeIntervalSince1970: 19))
            ],
            selectedUserID: userID
        )
        XCTAssertEqual(result.highlights.longestProject?.id, "more")
    }

    func testHistoryIsReverseChronologicalWithStableIDTieBreak() {
        let sameDate = Date(timeIntervalSince1970: 100)
        let result = ProfileStatistics.calculate(
            records: [
                record(id: "z", grade: "V1", date: sameDate),
                record(id: "a", grade: "V1", date: sameDate),
                record(id: "new", grade: "V2", date: sameDate.addingTimeInterval(10))
            ],
            selectedUserID: userID
        )
        XCTAssertEqual(result.history.map(\.id), ["new", "a", "z"])
    }

    @MainActor
    func testMetricsPopulateIndependentlyOfHistory() async {
        let userID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let profile = Profile(id: userID.uuidString, username: "climber", fullName: "Climber", avatarUrl: nil, bio: nil, createdAt: nil)
        let metrics = ProfileMetrics(routesCount: 7, likesCount: 14)
        let repo = MockProfileRepository(
            profile: profile,
            history: [],
            metrics: metrics
        )
        let viewModel = ProfileViewModel(repository: repo)
        await viewModel.load(userID: userID)
        XCTAssertEqual(viewModel.routesCount, 7)
        XCTAssertEqual(viewModel.likesCount, 14)
        XCTAssertEqual(viewModel.sendsCount, 0)
        XCTAssertEqual(viewModel.profile?.fullName, "Climber")
    }

    @MainActor
    func testStaleMetricsGenerationCannotOverwrite() async {
        let userA = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let userB = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
        let repo = DelayedMetricsRepository(
            profilesByUser: [
                userA: Profile(id: userA.uuidString, username: "a", fullName: "A", avatarUrl: nil, bio: nil, createdAt: nil),
                userB: Profile(id: userB.uuidString, username: "b", fullName: "B", avatarUrl: nil, bio: nil, createdAt: nil)
            ],
            metricsByUser: [
                userA: ProfileMetrics(routesCount: 3, likesCount: 30),
                userB: ProfileMetrics(routesCount: 5, likesCount: 50)
            ],
            delaysByUser: [userA: 100_000_000]
        )
        let viewModel = ProfileViewModel(repository: repo)
        async let firstLoad: () = viewModel.load(userID: userA)
        while viewModel.selectedUserID != userA {
            await Task.yield()
        }
        await viewModel.load(userID: userB)
        await firstLoad
        XCTAssertEqual(viewModel.selectedUserID, userB)
        XCTAssertEqual(viewModel.profile?.username, "b")
        XCTAssertEqual(viewModel.routesCount, 5)
        XCTAssertEqual(viewModel.likesCount, 50)
    }

    @MainActor
    func testSyncFromSessionUpdatesCurrentAccountProfile() async {
        let currentID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let repo = MockProfileRepository(profile: Profile(id: currentID.uuidString, username: "old", fullName: "Old", avatarUrl: nil, bio: nil, createdAt: nil))
        let viewModel = ProfileViewModel(repository: repo)
        await viewModel.selectAccount(userID: currentID)
        XCTAssertEqual(viewModel.profile?.fullName, "Old")
        let updated = Profile(id: currentID.uuidString, username: "new", fullName: "New", avatarUrl: nil, bio: "updated", createdAt: nil)
        viewModel.syncProfileFromSession(currentUserID: currentID, profile: updated)
        XCTAssertEqual(viewModel.profile?.fullName, "New")
        XCTAssertEqual(viewModel.profile?.bio, "updated")
    }

    @MainActor
    func testSyncFromSessionDoesNotOverwriteOtherAccount() async {
        let currentID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let otherID = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
        let otherProfile = Profile(id: otherID.uuidString, username: "other", fullName: "Other", avatarUrl: nil, bio: nil, createdAt: nil)
        let repo = MockProfileRepository(profile: otherProfile)
        let viewModel = ProfileViewModel(repository: repo)
        await viewModel.selectAccount(userID: otherID)
        XCTAssertEqual(viewModel.profile?.fullName, "Other")
        let updatedCurrent = Profile(id: currentID.uuidString, username: "new", fullName: "New", avatarUrl: nil, bio: "updated", createdAt: nil)
        viewModel.syncProfileFromSession(currentUserID: currentID, profile: updatedCurrent)
        XCTAssertEqual(viewModel.profile?.fullName, "Other")
        XCTAssertNil(viewModel.profile?.bio)
    }

    @MainActor
    func testSyncFromSessionNilProfileDoesNotEraseLoadedProfile() async {
        let currentID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let repo = MockProfileRepository(profile: Profile(id: currentID.uuidString, username: "old", fullName: "Old", avatarUrl: nil, bio: nil, createdAt: nil))
        let viewModel = ProfileViewModel(repository: repo)
        await viewModel.selectAccount(userID: currentID)
        XCTAssertEqual(viewModel.profile?.fullName, "Old")
        viewModel.syncProfileFromSession(currentUserID: currentID, profile: nil)
        XCTAssertEqual(viewModel.profile?.fullName, "Old")
    }
}

private final class DelayedMetricsRepository: ProfileRepository, @unchecked Sendable {
    let profilesByUser: [UUID: Profile]
    let historiesByUser: [UUID: [ProfileClimbHistoryItem]]
    let metricsByUser: [UUID: ProfileMetrics]
    let delaysByUser: [UUID: UInt64]

    init(
        profilesByUser: [UUID: Profile] = [:],
        historiesByUser: [UUID: [ProfileClimbHistoryItem]] = [:],
        metricsByUser: [UUID: ProfileMetrics] = [:],
        delaysByUser: [UUID: UInt64] = [:]
    ) {
        self.profilesByUser = profilesByUser
        self.historiesByUser = historiesByUser
        self.metricsByUser = metricsByUser
        self.delaysByUser = delaysByUser
    }

    private func delay(for userID: UUID) async throws {
        if let nanoseconds = delaysByUser[userID], nanoseconds > 0 {
            try await Task.sleep(nanoseconds: nanoseconds)
        }
    }

    func fetchProfile(userID: UUID) async throws -> Profile? {
        try await delay(for: userID)
        return profilesByUser[userID]
    }

    func fetchLeaderboard() async throws -> [ProfileLeaderboardEntry] {
        []
    }

    func fetchClimbHistory(userID: UUID) async throws -> [ProfileClimbHistoryItem] {
        try await delay(for: userID)
        return historiesByUser[userID] ?? []
    }

    func fetchMetrics(userID: UUID) async throws -> ProfileMetrics {
        try await delay(for: userID)
        return metricsByUser[userID] ?? ProfileMetrics(routesCount: 0, likesCount: 0)
    }
}
