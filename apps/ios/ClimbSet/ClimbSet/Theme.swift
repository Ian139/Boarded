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

    // Neutral panel roles derive from the active adaptive palette.
    var panelBackground: Color { AppColor.surface }
    var elevatedPanelBackground: Color { AppColor.surface }

    var primaryText: Color { AppColor.text }
    var secondaryText: Color { AppColor.text.opacity(0.7) }
    var primary: Color { AppColor.primary }
    var secondary: Color { AppColor.secondary }
    var accent: Color { AppColor.accent }
    var border: Color { AppColor.border }
    var subtleBorder: Color { AppColor.border }
    var destructive: Color { AppColor.destructive }
    var actionForeground: Color { AppColor.actionForeground }

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
            return AppColor.text
        case .hand:
            return AppColor.text.opacity(0.75)
        case .foot:
            return AppColor.text.opacity(0.45)
        }
    }
}

enum AppColor {
    private static let blackToken = Color.hex("#000000")
    private static let whiteToken = Color.hex("#FFFFFF")
    private static let redToken = Color.hex("#FF3B30")
    private static let tanToken = Color.hex("#E8DCC8")

    static let background = adaptive(light: tanToken, dark: blackToken)
    static let surface = adaptive(light: blackToken.opacity(0.06), dark: whiteToken.opacity(0.1))
    static let text = adaptive(light: blackToken, dark: whiteToken)
    static let muted = text.opacity(0.7)
    static let primary = redToken
    static let secondary = redToken
    static let actionForeground = blackToken
    static let accent = redToken
    static let border = text.opacity(0.12)
    static let destructive = redToken
    static let scrim = blackToken.opacity(0.62)

    private static func adaptive(light: Color, dark: Color) -> Color {
        #if canImport(UIKit)
        Color(uiColor: UIColor { traits in
            UIColor(traits.userInterfaceStyle == .dark ? dark : light)
        })
        #else
        dark
        #endif
    }
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

private struct BoardedGlassSurfaceModifier<S: Shape>: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorScheme) private var colorScheme

    let shape: S
    let interactive: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        if reduceTransparency {
            content
                .background(theme.background, in: shape)
                .overlay {
                    shape.stroke(theme.primaryText.opacity(0.32), lineWidth: 1)
                }
        } else if #available(iOS 26.0, *) {
            if interactive {
                content.glassEffect(.regular.interactive(), in: shape)
            } else {
                content.glassEffect(.regular, in: shape)
            }
        } else {
            content
                .background(theme.panelBackground, in: shape)
                .background(.ultraThinMaterial, in: shape)
                .overlay {
                    shape.stroke(theme.border, lineWidth: 1)
                }
        }
    }
}

struct BoardedGlassContainer<Content: View>: View {
    private let spacing: CGFloat?
    private let content: () -> Content

    init(spacing: CGFloat? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.spacing = spacing
        self.content = content
    }

    @ViewBuilder
    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) {
                content()
            }
        } else {
            content()
        }
    }
}

private struct BoardedPanelModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    let elevated: Bool

    func body(content: Content) -> some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        let shape = RoundedRectangle(cornerRadius: theme.panelCornerRadius, style: .continuous)
        content
            .padding(theme.panelPadding)
            .boardedGlassSurface(in: shape)
    }
}

extension View {
    func boardedPageBackground() -> some View {
        modifier(BoardedPageBackgroundModifier())
    }

    func boardedPanel(elevated: Bool = true) -> some View {
        modifier(BoardedPanelModifier(elevated: elevated))
    }

    func boardedGlassSurface<S: Shape>(in shape: S, interactive: Bool = false) -> some View {
        modifier(BoardedGlassSurfaceModifier(shape: shape, interactive: interactive))
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
        let shape = RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous)
        Button(action: action) {
            Text(title)
                .font(AppTypography.label)
                .foregroundStyle(isSelected ? theme.primary : theme.primaryText)
                .padding(.horizontal, 12)
                .frame(minHeight: 36)
                .background {
                    if isSelected {
                        theme.primary.opacity(0.15)
                    }
                }
                .boardedGlassSurface(in: shape, interactive: true)
                .overlay {
                    if isSelected {
                        shape.stroke(theme.primary.opacity(0.5), lineWidth: 1)
                    }
                }
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
            .foregroundStyle(kind == .primary ? theme.actionForeground : theme.primary)
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
