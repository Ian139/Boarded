import Foundation
import SwiftUI
import Combine

@MainActor
final class RoutesViewModel: ObservableObject {
    @Published var routes: [Route] = []
    @Published var isLoading = false
    @Published var searchText = ""
    @Published var selectedSort: SortOption = .newest

    private let repository: RoutesRepository

    init(repository: RoutesRepository) {
        self.repository = repository
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await repository.fetchRoutes()
            routes = data
        } catch {
            routes = []
        }
    }

    var filteredRoutes: [Route] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let base = query.isEmpty ? routes : routes.filter {
            $0.name.lowercased().contains(query)
                || ($0.userName ?? "").lowercased().contains(query)
                || ($0.gradeV ?? "").lowercased().contains(query)
        }
        return base.sorted { a, b in
            switch selectedSort {
            case .newest:
                return parseDate(a.createdAt) > parseDate(b.createdAt)
            case .mostLiked:
                return (a.likeCount ?? 0) > (b.likeCount ?? 0)
            case .mostClimbed:
                return a.ascents.count > b.ascents.count
            }
        }
    }

    private func parseDate(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        if let date = fallback.date(from: value) {
            return date
        }
        return Date()
    }
}

enum SortOption: String, CaseIterable, Identifiable {
    case newest = "Newest"
    case mostLiked = "Most Liked"
    case mostClimbed = "Most Climbed"

    var id: String { rawValue }
}
