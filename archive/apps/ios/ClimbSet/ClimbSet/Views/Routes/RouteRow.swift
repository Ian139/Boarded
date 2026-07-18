import SwiftUI
import Foundation

struct RouteRow: View {
    let route: Route

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(displayGrade)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(route.gradeV == nil ? AppColor.muted : AppColor.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(width: 42, alignment: .leading)

            wallThumbnail

            VStack(alignment: .leading, spacing: 5) {
                Text(route.name)
                    .font(AppTypography.headline)
                    .foregroundColor(AppColor.text)
                    .lineLimit(1)
                    .truncationMode(.tail)

                HStack(spacing: 10) {
                    Text(route.userName ?? "Anonymous")
                        .lineLimit(1)
                        .truncationMode(.tail)
                    holdDots
                    Text("\(route.holds.count)")
                        .fixedSize()
                }
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)

                HStack(spacing: 8) {
                    Text(metricsText)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(timeAgo)
                        .foregroundColor(AppColor.muted.opacity(0.7))
                        .fixedSize()
                }
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)

            actionGlyphs
                .frame(width: 82, alignment: .trailing)
                .fixedSize()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var wallThumbnail: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(AppColor.border.opacity(0.7))

            if let url = route.wallImageURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        Rectangle()
                            .fill(AppColor.surface)
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        defaultWallThumbnail
                    @unknown default:
                        defaultWallThumbnail
                    }
                }
            } else {
                defaultWallThumbnail
            }
        }
        .frame(width: 48, height: 48)
        .fixedSize()
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(AppColor.border.opacity(0.65), lineWidth: 1)
        )
    }

    private var holdDots: some View {
        HStack(spacing: 2) {
            ForEach(Array(route.holds.prefix(4))) { hold in
                Circle()
                    .fill(Color.hex(hold.type.colorHex))
                    .frame(width: 6, height: 6)
            }
        }
    }

    private var actionGlyphs: some View {
        HStack(spacing: 4) {
            Image(systemName: (route.isLiked ?? false) ? "heart.fill" : "heart")
                .foregroundColor((route.isLiked ?? false) ? AppColor.destructive : AppColor.muted)
                .frame(width: 24, height: 32)
            Image(systemName: route.ascents.isEmpty ? "checkmark.circle" : "checkmark.circle.fill")
                .foregroundColor(route.ascents.isEmpty ? AppColor.muted : AppColor.secondary)
                .frame(width: 24, height: 32)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(AppColor.muted.opacity(0.55))
                .frame(width: 18, height: 32)
        }
        .font(.system(size: 17, weight: .medium))
    }

    private var displayGrade: String {
        route.gradeV ?? "—"
    }

    private var defaultWallThumbnail: some View {
        Image("DefaultWall")
            .resizable()
            .scaledToFill()
    }

    private var metricsText: String {
        let likes = route.likeCount ?? 0
        let sends = route.ascents.count
        if sends > 0 {
            return "\(likes) likes • \(sends) sends"
        }
        return "\(likes) likes"
    }

    private var timeAgo: String {
        let diff = Date().timeIntervalSince(parseDate(route.createdAt))
        let mins = Int(diff / 60)
        if mins < 60 { return "\(mins)m" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h" }
        let days = hours / 24
        if days < 7 { return "\(days)d" }
        return "\(days / 7)w"
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
