import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct BoardedTheme {
    let colorScheme: ColorScheme

    var background: Color {
        colorScheme == .dark ? .oklch(0.14, 0.01, 80) : .oklch(0.97, 0.01, 85)
    }

    var backgroundGradient: some View {
        ZStack {
            background
            RadialGradient(
                colors: [
                    .oklch(0.82, 0.08, 78, opacity: 0.3),
                    .clear
                ],
                center: UnitPoint(x: 0.08, y: -0.10),
                startRadius: 0,
                endRadius: 544
            )
            RadialGradient(
                colors: [
                    .oklch(0.76, 0.09, 150, opacity: 0.18),
                    .clear
                ],
                center: UnitPoint(x: 0.92, y: 0.12),
                startRadius: 0,
                endRadius: 480
            )
        }
    }

    var panelBackground: Color {
        colorScheme == .dark ? .oklch(0.18, 0.01, 80, opacity: 0.78) : .oklch(0.99, 0.005, 85, opacity: 0.78)
    }

    var elevatedPanelBackground: Color {
        colorScheme == .dark ? .oklch(0.20, 0.012, 80, opacity: 0.95) : .oklch(0.99, 0.005, 85, opacity: 0.94)
    }

    var primaryText: Color {
        colorScheme == .dark ? .oklch(0.96, 0.01, 85) : .oklch(0.25, 0.03, 55)
    }

    var secondaryText: Color {
        colorScheme == .dark ? .oklch(0.70, 0.02, 85) : .oklch(0.45, 0.03, 55)
    }

    var primary: Color {
        colorScheme == .dark ? .oklch(0.68, 0.12, 140) : .oklch(0.50, 0.10, 55)
    }

    var secondary: Color {
        colorScheme == .dark ? .oklch(0.60, 0.09, 60) : .oklch(0.55, 0.12, 155)
    }

    var accent: Color {
        colorScheme == .dark ? .oklch(0.62, 0.10, 115) : .oklch(0.60, 0.14, 150)
    }

    var border: Color {
        colorScheme == .dark ? .oklch(0.28, 0.01, 80) : .oklch(0.90, 0.02, 85)
    }

    var subtleBorder: Color { border.opacity(0.8) }
    var destructive: Color {
        colorScheme == .dark ? .oklch(0.60, 0.19, 25) : .oklch(0.55, 0.20, 25)
    }

    let pagePadding: CGFloat = 16
    let panelPadding: CGFloat = 16
    let panelCornerRadius: CGFloat = 20
    let controlCornerRadius: CGFloat = 12
    let animationDuration: Double = 0.2
}

enum AppColor {
    static let background = Color.oklchAdaptive(light: (0.97, 0.01, 85), dark: (0.14, 0.01, 80))
    static let surface = Color.oklchAdaptive(light: (0.99, 0.005, 85), dark: (0.18, 0.01, 80))
    static let text = Color.oklchAdaptive(light: (0.25, 0.03, 55), dark: (0.96, 0.01, 85))
    static let muted = Color.oklchAdaptive(light: (0.45, 0.03, 55), dark: (0.70, 0.02, 85))
    static let primary = Color.oklchAdaptive(light: (0.50, 0.10, 55), dark: (0.68, 0.12, 140))
    static let secondary = Color.oklchAdaptive(light: (0.55, 0.12, 155), dark: (0.60, 0.09, 60))
    static let accent = Color.oklchAdaptive(light: (0.60, 0.14, 150), dark: (0.62, 0.10, 115))
    static let border = Color.oklchAdaptive(light: (0.90, 0.02, 85), dark: (0.28, 0.01, 80))
    static let destructive = Color.oklchAdaptive(light: (0.55, 0.20, 25), dark: (0.60, 0.19, 25))
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
        content.background {
            theme.backgroundGradient
                .ignoresSafeArea()
        }
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
            .background(.ultraThinMaterial, in: shape)
            .background(elevated ? theme.elevatedPanelBackground : theme.panelBackground, in: shape)
            .overlay {
                shape.stroke(
                    contrast == .increased ? theme.border : theme.subtleBorder,
                    lineWidth: contrast == .increased ? 2 : 1
                )
            }
            .shadow(
                color: colorScheme == .dark ? .black.opacity(0.28) : .black.opacity(0.08),
                radius: colorScheme == .dark ? 22 : 18,
                y: colorScheme == .dark ? 8 : 6
            )
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
                .background(isSelected ? theme.primary.opacity(0.12) : theme.panelBackground)
                .overlay {
                    RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous)
                        .stroke(isSelected ? theme.primary.opacity(0.4) : theme.border, lineWidth: 1)
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
            .background(kind == .primary ? theme.primary : theme.primary.opacity(0.12))
            .overlay {
                RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous)
                    .stroke(kind == .secondary ? theme.primary.opacity(0.4) : .clear, lineWidth: 1)
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
extension Color {
    static func oklch(_ lightness: Double, _ chroma: Double, _ hue: Double, opacity: Double = 1) -> Color {
        let radians = hue * .pi / 180
        let a = chroma * cos(radians)
        let b = chroma * sin(radians)
        let l = lightness + 0.3963377774 * a + 0.2158037573 * b
        let m = lightness - 0.1055613458 * a - 0.0638541728 * b
        let s = lightness - 0.0894841775 * a - 1.2914855480 * b
        let l3 = l * l * l
        let m3 = m * m * m
        let s3 = s * s * s
        let red =  4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
        let green = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
        let blue = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3
        func sRGB(_ value: Double) -> Double {
            let clamped = min(max(value, 0), 1)
            return clamped <= 0.0031308
                ? clamped * 12.92
                : 1.055 * pow(clamped, 1 / 2.4) - 0.055
        }
        return Color(red: sRGB(red), green: sRGB(green), blue: sRGB(blue), opacity: opacity)
    }

    static func oklchAdaptive(
        light: (Double, Double, Double),
        dark: (Double, Double, Double)
    ) -> Color {
        #if canImport(UIKit)
        let lightColor = UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            let color = Color.oklch(value.0, value.1, value.2)
            return UIColor(color)
        }
        return Color(lightColor)
        #else
        return Color.oklch(light.0, light.1, light.2)
        #endif
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
    static func adaptive(light: String, dark: String) -> Color {
        #if canImport(UIKit)
        let lightRGB = hexToRGB(light)
        let darkRGB = hexToRGB(dark)
        return Color(UIColor { traits in
            if traits.userInterfaceStyle == .dark {
                return UIColor(red: darkRGB.r, green: darkRGB.g, blue: darkRGB.b, alpha: 1)
            }
            return UIColor(red: lightRGB.r, green: lightRGB.g, blue: lightRGB.b, alpha: 1)
        })
        #else
        let rgb = hexToRGB(light)
        return Color(red: rgb.r, green: rgb.g, blue: rgb.b)
        #endif
    }

    static func hex(_ value: String) -> Color {
        let rgb = hexToRGB(value)
        return Color(red: rgb.r, green: rgb.g, blue: rgb.b)
    }
}
