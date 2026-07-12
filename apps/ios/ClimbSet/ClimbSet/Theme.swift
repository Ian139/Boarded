import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

enum AppColor {
    static let background = Color.adaptive(light: "#f8f5ee", dark: "#0b0905")
    static let surface = Color.adaptive(light: "#fdfcf8", dark: "#14110d")
    static let text = Color.adaptive(light: "#2d1e14", dark: "#f5f1ea")
    static let muted = Color.adaptive(light: "#635146", dark: "#a49e91")
    static let primary = Color.adaptive(light: "#8e5224", dark: "#6faa62")
    static let secondary = Color.adaptive(light: "#258651", dark: "#a87346")
    static let accent = Color.adaptive(light: "#319751", dark: "#848d42")
    static let border = Color.adaptive(light: "#e4ddcf", dark: "#2b2823")
    static let destructive = Color.adaptive(light: "#cc272e", dark: "#db4241")
}

enum AppTypography {
    static let title = Font.system(size: 22, weight: .semibold, design: .rounded)
    static let headline = Font.system(size: 16, weight: .semibold, design: .rounded)
    static let body = Font.system(size: 14, weight: .regular, design: .rounded)
    static let label = Font.system(size: 12, weight: .medium, design: .rounded)
}

enum AppLayout {
    static let cornerRadius: CGFloat = 14
    static let horizontalPadding: CGFloat = 16
    static let verticalPadding: CGFloat = 12
    static let contentMaxWidth: CGFloat = 560
    static let editorMaxWidth: CGFloat = 760
    static let defaultWallAspectRatio: CGFloat = 3001.0 / 2733.0
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
