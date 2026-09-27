# Benjamins — iOS shell

UIKit + full-screen `WKWebView` wrapper around the single-file web app. Implements the iOS side of
[`docs/NATIVE_BRIDGE.md`](../docs/NATIVE_BRIDGE.md). iOS 16+, iPhone (portrait) and iPad.

```
ios/
  Benjamins.xcodeproj     open in Xcode (target + scheme "Benjamins")
  Benjamins/              Swift sources, Info.plist, Assets.xcassets, www/ (the bundled web app)
  selftest/index.html     shell self-test page (auto-checks storage/crypto/bridge, buttons for every call)
  scripts/                sync-assets.sh (web/dist + design/ icons -> Benjamins/), svg2png.swift
  build.sh                build, install and launch on the Simulator
```

## Simulator

```sh
./ios/build.sh             # bundles web/dist/index.html if present, builds, installs, launches
./ios/build.sh --selftest  # bundles the self-test page instead
```

Uses the booted simulator (or boots the first iPhone). You can also just open the project in Xcode
and press Run: the build phase "Sync web bundle & icons" copies the latest `web/dist/index.html`,
`design/ios/AppIcon-1024*.png` and `design/icon/splash-glyph.*` into the app first.

## Your own iPhone with a free Apple ID

1. Xcode › Settings › Accounts › **+** › Apple ID (this creates a free "Personal Team").
2. Open `ios/Benjamins.xcodeproj` › target **Benjamins** › Signing & Capabilities › tick
   *Automatically manage signing* › Team = your Personal Team. If Xcode reports that the bundle
   identifier isn't available, change it to something unique (e.g. `app.watchyourbenjamins.yourname`);
   a different bundle ID is a different app with its own, empty data.
3. Connect the iPhone by cable, unlock it, tap *Trust*. Turn on Settings › Privacy & Security ›
   **Developer Mode** (it appears after the phone has been connected to Xcode once; the phone restarts).
4. Select the iPhone as run destination and press ⌘R.
5. On first launch iOS refuses the unknown developer: Settings › General › VPN & Device Management ›
   your Apple ID › **Trust**.

Free provisioning expires after **7 days**: the app then won't open until you connect the phone and
press Run again (data is kept as long as you don't delete the app). Limits: 3 such apps per device,
10 new app IDs per week.

## TestFlight public link (needs the paid Apple Developer Program, 99 USD/year)

1. Enroll at developer.apple.com/programs, then pick that team under Signing & Capabilities.
2. App Store Connect › Apps › **+** › New App: iOS, name, bundle ID `app.watchyourbenjamins`
   (Xcode's automatic signing registers the ID; otherwise add it under Certificates, Identifiers &
   Profiles), any SKU.
3. Xcode: destination *Any iOS Device (arm64)* › Product › **Archive** › Distribute App ›
   App Store Connect › Upload. Raise the build number (target › General › Build) for every upload.
4. App Store Connect › TestFlight: once the build is processed (export compliance is pre-answered via
   `ITSAppUsesNonExemptEncryption = NO`), create an **External** group, add the build, fill in the
   test information and submit it for Beta App Review (first build of each version, usually < 1 day).
5. After approval enable the group's **Public Link** and share it. Testers install the TestFlight app
   and open the link. Builds expire after 90 days; up to 10,000 external testers. Internal testers
   (members of your App Store Connect team, up to 100) need no review.

## Notes

- The page is served as `app://benjamins/index.html` by `AppSchemeHandler` (a secure context).
  localStorage and IndexedDB are keyed by this origin and live in the app's persistent WebKit data
  store: **never change the scheme or host after release**, and deleting the app deletes the data.
- `pause`/`resume` are sent when the app resigns/becomes active: WebKit suspends the page as soon as
  the app is in the background, so this is the last reliable moment to save.
- Launch screen and native cover: `#05050A` + eye glyph until the `ready` message (plus two frames)
  or 1.2 s. iOS caches launch screens; after changing it, delete the app to see the new one.
- Debug builds only: Safari › Develop › (Simulator/iPhone) inspects the page, JS console output is
  mirrored to the Xcode console, and `-WYBQuery <query>` launch arguments drive the self-test page
  (`theme=light|skip`, `noready=1`, `action=save|share|text|alert|confirm|prompt`).
