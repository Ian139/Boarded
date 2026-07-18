import SwiftUI

struct EmptyStateView: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(AppColor.secondary.opacity(0.12))
                    .frame(width: 72, height: 72)
                Text("🧗")
                    .font(.system(size: 30))
            }
            Text(title)
                .font(AppTypography.headline)
                .foregroundColor(AppColor.text)
            Text(subtitle)
                .font(AppTypography.body)
                .foregroundColor(AppColor.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 240)
        }
    }
}
