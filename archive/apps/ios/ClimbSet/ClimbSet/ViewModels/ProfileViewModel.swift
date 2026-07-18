import Foundation
import SwiftUI
import Combine
import Supabase

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var routesCount: Int = 0
    @Published var sendsCount: Int = 0
    @Published var likesCount: Int = 0
    @Published var highestGrade: String? = nil

    func load(userId: UUID?) async {
        guard let client = SupabaseClientProvider.client, let userId else {
            routesCount = 0
            sendsCount = 0
            likesCount = 0
            highestGrade = nil
            return
        }

        do {
            let routes: [Route] = try await client.database
                .from("routes")
                .select("*, ascents(*)")
                .eq("user_id", value: userId.uuidString)
                .order("created_at", ascending: false)
                .execute()
                .value

            let ascents: [Ascent] = try await client.database
                .from("ascents")
                .select("*")
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value

            let routeIds = routes.map { $0.id }
            let likes: [RouteLike] = routeIds.isEmpty ? [] : (try await client.database
                .from("route_likes")
                .select("route_id")
                .in("route_id", values: routeIds)
                .execute()
                .value)

            routesCount = routes.count
            sendsCount = ascents.count
            likesCount = likes.count
            highestGrade = highestGrade(from: ascents, routes: routes)
        } catch {
            routesCount = 0
            sendsCount = 0
            likesCount = 0
            highestGrade = nil
        }
    }

    private func highestGrade(from ascents: [Ascent], routes: [Route]) -> String? {
        let ascentGrades = ascents.compactMap { $0.gradeV }
        let routeGrades = routes.compactMap { $0.gradeV }
        let grades = ascentGrades + routeGrades
        return grades.sorted(by: gradeValue).last
    }

    private func gradeValue(_ value: String, _ other: String) -> Bool {
        gradeNumber(value) < gradeNumber(other)
    }

    private func gradeNumber(_ value: String) -> Int {
        let cleaned = value.uppercased().replacingOccurrences(of: "V", with: "")
        return Int(cleaned) ?? 0
    }
}
