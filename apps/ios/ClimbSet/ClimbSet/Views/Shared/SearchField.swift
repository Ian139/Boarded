import SwiftUI

struct SearchField: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var text: String
    let placeholder: String

    var body: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        let shape = RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous)
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(theme.secondaryText)
            TextField(placeholder, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .font(AppTypography.body)
                .foregroundStyle(theme.primaryText)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(theme.secondaryText)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 44)
        .boardedGlassSurface(in: shape, interactive: true)
    }
}
