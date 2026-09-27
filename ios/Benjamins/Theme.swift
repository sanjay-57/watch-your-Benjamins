import UIKit

/// The web app's theme as last reported through `setTheme` (persisted for the next cold start).
struct AppTheme {
    static let darkBackground = "#07120C"
    static let lightBackground = "#F2F0E6"

    var isDark: Bool
    var backgroundHex: String

    var color: UIColor {
        UIColor(hex: backgroundHex) ?? UIColor(hex: Self.darkBackground)!
    }
}

enum ThemeStore {
    private static let modeKey = "wyb.theme.mode"
    private static let backgroundKey = "wyb.theme.bg"

    static func load() -> AppTheme {
        let defaults = UserDefaults.standard
        let isDark = defaults.string(forKey: modeKey) != "light"
        let fallback = isDark ? AppTheme.darkBackground : AppTheme.lightBackground
        let saved = defaults.string(forKey: backgroundKey).flatMap { UIColor(hex: $0) != nil ? $0 : nil }
        return AppTheme(isDark: isDark, backgroundHex: saved ?? fallback)
    }

    static func save(_ theme: AppTheme) {
        let defaults = UserDefaults.standard
        defaults.set(theme.isDark ? "dark" : "light", forKey: modeKey)
        defaults.set(theme.backgroundHex, forKey: backgroundKey)
    }
}

extension UIColor {
    /// Parses `#RGB`, `#RRGGBB` or `#RRGGBBAA`.
    convenience init?(hex: String) {
        var digits = hex.trimmingCharacters(in: .whitespaces)
        if digits.hasPrefix("#") { digits.removeFirst() }
        if digits.count == 3 { digits = digits.map { "\($0)\($0)" }.joined() }
        guard digits.count == 6 || digits.count == 8,
              digits.allSatisfy(\.isHexDigit),
              let value = UInt64(digits, radix: 16) else { return nil }
        let rgba = digits.count == 6 ? (value << 8) | 0xFF : value
        self.init(red: CGFloat((rgba >> 24) & 0xFF) / 255,
                  green: CGFloat((rgba >> 16) & 0xFF) / 255,
                  blue: CGFloat((rgba >> 8) & 0xFF) / 255,
                  alpha: CGFloat(rgba & 0xFF) / 255)
    }
}
