import Foundation

struct ProfileCalculatedData: Hashable {
    let points: Int?
    let sendsCount: Int
    let flashedCount: Int
    let routesCreatedCount: Int
    let highestGrade: String?
    let leaderboard: [ProfileLeaderboardEntry]
    let history: [ProfileClimbHistoryItem]
    let highlights: ProfileHighlights
}

enum ProfileStatistics {
    /// Mirrors the web grade utility: V grades are ordered VB, V0 ... V17
    /// and unknown values have rank -1. The current web profile exposes no
    /// points formula, so points remain nil rather than inventing one.
    static func gradeRank(_ grade: String?) -> Int {
        guard let grade else { return -1 }
        let normalized = grade.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if normalized == "VB" { return 0 }
        guard normalized.first == "V", let value = Int(normalized.dropFirst()), value >= 0 else { return -1 }
        return value + 1
    }

    static func calculate(
        records: [ProfileScoringRecord],
        profiles: [String: Profile] = [:],
        selectedUserID: String
    ) -> ProfileCalculatedData {
        let eligible = records.filter { !$0.userId.isEmpty }
        let selected = eligible.filter { $0.userId == selectedUserID }
        let grouped = Dictionary(grouping: eligible, by: \.userId)

        let leaderboard = grouped.map { userID, userRecords in
            let profile = profiles[userID]
            let fallbackName = userRecords.compactMap { $0.userName }.first(where: {
                !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            })
            let displayName = profile?.displayName ?? fallbackName ?? "Anonymous"
            let grades = userRecords.compactMap(\.scoringGrade)
            return ProfileLeaderboardEntry(
                id: userID,
                displayName: displayName,
                points: nil,
                sendsCount: userRecords.count,
                highestGrade: grades
                    .max { gradeRank($0) < gradeRank($1) },
                profile: profile
            )
        }
        .sorted { lhs, rhs in
            if lhs.points != rhs.points {
                // Points are currently unsupported by the web profile; nil values tie.
                return (lhs.points ?? 0) > (rhs.points ?? 0)
            }
            let nameOrder = lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName)
            if nameOrder != .orderedSame { return nameOrder == .orderedAscending }
            return lhs.id < rhs.id
        }

        let history = selected
            .sorted(by: newerRecord)
            .map(historyItem)
        let best = selected.max(by: bestRecordComesBefore)
        let longest = selected.max(by: longestRecordComesBefore)
        let routesCreated = Set(records.filter { $0.userId == selectedUserID }.compactMap { $0.route?.userId == selectedUserID ? $0.routeId : nil }).count

        return ProfileCalculatedData(
            points: nil,
            sendsCount: selected.count,
            flashedCount: selected.filter(\.flashed).count,
            routesCreatedCount: routesCreated,
            highestGrade: selected.compactMap(\.scoringGrade).max { gradeRank($0) < gradeRank($1) },
            leaderboard: leaderboard,
            history: history,
            highlights: ProfileHighlights(bestClimb: best.map(historyItem), longestProject: longest.map(historyItem))
        )
    }

    private static func historyItem(_ record: ProfileScoringRecord) -> ProfileClimbHistoryItem {
        ProfileClimbHistoryItem(
            id: record.id,
            routeId: record.routeId,
            routeName: record.routeName,
            wallId: record.route?.wallId,
            grade: record.scoringGrade,
            flashed: record.flashed,
            completedAt: record.completedAt,
            route: record.route
        )
    }

    private static func newerRecord(_ lhs: ProfileScoringRecord, _ rhs: ProfileScoringRecord) -> Bool {
        let lhsDate = lhs.completedAt ?? .distantPast
        let rhsDate = rhs.completedAt ?? .distantPast
        if lhsDate != rhsDate { return lhsDate > rhsDate }
        return lhs.id < rhs.id
    }

    private static func bestRecordComesBefore(_ lhs: ProfileScoringRecord, _ rhs: ProfileScoringRecord) -> Bool {
        let lhsGrade = gradeRank(lhs.scoringGrade)
        let rhsGrade = gradeRank(rhs.scoringGrade)
        if lhsGrade != rhsGrade { return lhsGrade < rhsGrade }
        return newerRecord(rhs, lhs)
    }

    private static func longestRecordComesBefore(_ lhs: ProfileScoringRecord, _ rhs: ProfileScoringRecord) -> Bool {
        switch (lhs.attemptCount, rhs.attemptCount) {
        case let (left?, right?) where left != right:
            return left < right
        case (nil, .some):
            return true
        case (.some, nil):
            return false
        default:
            break
        }

        let lhsDuration = duration(for: lhs)
        let rhsDuration = duration(for: rhs)
        switch (lhsDuration, rhsDuration) {
        case let (left?, right?) where left != right:
            return left < right
        case (nil, .some):
            return true
        case (.some, nil):
            return false
        default:
            return newerRecord(lhs, rhs)
        }
    }

    private static func duration(for record: ProfileScoringRecord) -> TimeInterval? {
        guard let first = record.firstAttemptAt, let completed = record.completedAt else { return nil }
        return max(0, completed.timeIntervalSince(first))
    }
}
