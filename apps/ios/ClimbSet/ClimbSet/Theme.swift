import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct BoardedTheme {
    // Kept in the initializer so existing views can continue to construct a theme
    // from the environment while the visual system remains intentionally dark-first.
    let colorScheme: ColorScheme

    var background: Color { AppColor.background }

    // Compatibility for views that previously expected a gradient-backed page.
    // The redesigned system uses one continuous background instead.
    var backgroundGradient: some View { background }

    // Frosted panels combine the surface token with the system material blur.
    var panelBackground: Color { AppColor.surface.opacity(0.8) }
    var elevatedPanelBackground: Color { AppColor.surface.opacity(0.8) }

    var primaryText: Color { AppColor.text }
    var secondaryText: Color { AppColor.text.opacity(0.7) }
    var primary: Color { AppColor.primary }
    var secondary: Color { AppColor.secondary }
    var accent: Color { AppColor.primary }
    var border: Color { AppColor.text.opacity(0.12) }
    var subtleBorder: Color { border }
    var destructive: Color { AppColor.secondary }

    let pagePadding: CGFloat = 16
    let panelPadding: CGFloat = 16
    let panelCornerRadius: CGFloat = 20
    let controlCornerRadius: CGFloat = 12
    let animationDuration: Double = 0.2

    func holdColor(for type: HoldType) -> Color {
        switch type {
        case .start:
            return AppColor.primary
        case .finish:
            return AppColor.secondary
        case .hand:
            return AppColor.text
        case .foot:
            return AppColor.text.opacity(0.7)
        }
    }
}

enum AppColor {
    static let background = Color.hex("#09090B")
    static let surface = Color.hex("#141417")
    static let text = Color.hex("#FFFFFF")
    static let muted = text.opacity(0.7)
    static let primary = Color.hex("#00E599")
    static let secondary = Color.hex("#FF5C00")
    static let accent = primary
    static let border = text.opacity(0.12)
    static let destructive = secondary
}

enum AppTypography {
    static let largeTitle = Font.system(.largeTitle, design: .rounded).weight(.bold)
    static let title = Font.system(.title2, design: .rounded).weight(.bold)
    static let headline = Font.system(.headline, design: .rounded).weight(.semibold)
    static let body = Font.system(.body, design: .rounded)
    static let label = Font.system(.footnote, design: .rounded).weight(.medium)
    static let caption = Font.system(.caption, design: .rounded).weight(.medium)
}

enum AppLayout {
    static let cornerRadius: CGFloat = 20
    static let controlCornerRadius: CGFloat = 12
    static let horizontalPadding: CGFloat = 16
    static let verticalPadding: CGFloat = 12
    static let contentMaxWidth: CGFloat = 560
    static let editorMaxWidth: CGFloat = 760
    static let defaultWallAspectRatio: CGFloat = 3001.0 / 2733.0
}

private struct BoardedPageBackgroundModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        content.background(theme.background.ignoresSafeArea())
    }
}

private struct BoardedPanelModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var contrast
    let elevated: Bool

    func body(content: Content) -> some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        let shape = RoundedRectangle(cornerRadius: theme.panelCornerRadius, style: .continuous)
        content
            .padding(theme.panelPadding)
            .background(theme.panelBackground, in: shape)
            .background(.ultraThinMaterial, in: shape)
            .overlay {
                shape.stroke(
                    contrast == .increased ? theme.border : theme.subtleBorder,
                    lineWidth: contrast == .increased ? 2 : 1
                )
            }
    }
}

extension View {
    func boardedPageBackground() -> some View {
        modifier(BoardedPageBackgroundModifier())
    }

    func boardedPanel(elevated: Bool = true) -> some View {
        modifier(BoardedPanelModifier(elevated: elevated))
    }
}

struct BoardedSectionHeading: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    var subtitle: String?

    var body: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(AppTypography.headline)
                .foregroundStyle(theme.primaryText)
                .fixedSize(horizontal: false, vertical: true)
            if let subtitle {
                Text(subtitle)
                    .font(AppTypography.body)
                    .foregroundStyle(theme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct BoardedFilterControl: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        Button(action: action) {
            Text(title)
                .font(AppTypography.label)
                .foregroundStyle(isSelected ? theme.primary : theme.primaryText)
                .padding(.horizontal, 12)
                .frame(minHeight: 36)
                .background(isSelected ? theme.primary.opacity(0.15) : theme.panelBackground)
                .overlay {
                    RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous)
                        .stroke(isSelected ? theme.primary.opacity(0.5) : theme.border, lineWidth: 1)
                }
                .clipShape(RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct BoardedButtonStyle: ButtonStyle {
    enum Kind {
        case primary
        case secondary
    }

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let kind: Kind

    init(_ kind: Kind = .primary) {
        self.kind = kind
    }

    func makeBody(configuration: Configuration) -> some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        configuration.label
            .font(AppTypography.headline)
            .foregroundStyle(kind == .primary ? theme.background : theme.primary)
            .frame(minHeight: 44)
            .padding(.horizontal, 16)
            .background(kind == .primary ? theme.primary : theme.primary.opacity(0.15))
            .overlay {
                RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous)
                    .stroke(kind == .secondary ? theme.primary.opacity(0.5) : .clear, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous))
            .opacity(configuration.isPressed ? 0.86 : 1)
            .scaleEffect(reduceMotion || !configuration.isPressed ? 1 : 0.98)
            .animation(
                reduceMotion ? .linear(duration: 0.01) : .easeOut(duration: theme.animationDuration),
                value: configuration.isPressed
            )
    }
}

enum AppAppearanceMode: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

private func hexToRGB(_ value: String) -> (r: Double, g: Double, b: Double) {
    let cleaned = value.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var hex: UInt64 = 0
    guard Scanner(string: cleaned).scanHexInt64(&hex) else { return (0, 0, 0) }
    if cleaned.count == 6 {
        let r = Double((hex >> 16) & 0xff) / 255.0
        let g = Double((hex >> 8) & 0xff) / 255.0
        let b = Double(hex & 0xff) / 255.0
        return (r, g, b)
    }
    if cleaned.count == 8 {
        let r = Double((hex >> 24) & 0xff) / 255.0
        let g = Double((hex >> 16) & 0xff) / 255.0
        let b = Double((hex >> 8) & 0xff) / 255.0
        return (r, g, b)
    }
    return (0, 0, 0)
}

#if canImport(UIKit)
extension UIColor {
    static func fromHex(_ value: String) -> UIColor {
        let rgb = hexToRGB(value)
        return UIColor(red: rgb.r, green: rgb.g, blue: rgb.b, alpha: 1)
    }
}
#endif

extension Color {
    // Retained for legacy hold data while callers migrate to semantic theme colors.
    static func hex(_ value: String) -> Color {
        let rgb = hexToRGB(value)
        return Color(red: rgb.r, green: rgb.g, blue: rgb.b)
    }
}
