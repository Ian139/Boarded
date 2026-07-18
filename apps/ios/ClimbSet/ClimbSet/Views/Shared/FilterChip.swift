import SwiftUI

struct FilterChip: View {
    let title: String
    let isActive: Bool

    var body: some View {
        Text(title)
            .font(AppTypography.label)
            .foregroundColor(isActive ? AppColor.primary : AppColor.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isActive ? AppColor.primary.opacity(0.12) : AppColor.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isActive ? AppColor.primary.opacity(0.35) : AppColor.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
