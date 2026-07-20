import SwiftUI

struct FilterChip: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let isActive: Bool

    var body: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        Text(title)
            .font(AppTypography.label)
            .foregroundStyle(isActive ? theme.primary : theme.primaryText)
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background(isActive ? theme.primary.opacity(0.12) : theme.panelBackground)
            .overlay {
                RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous)
                    .stroke(isActive ? theme.primary.opacity(0.4) : theme.border, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous))
    }
}
