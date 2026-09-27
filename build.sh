#!/usr/bin/env bash
# One command to build everything:
#   ./build.sh          web bundle → Android APK (releases/) → PWA folder + zip (releases/)
#   ./build.sh --ios    …and also build + launch the iOS app in the booted Simulator
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(node -p "require('$ROOT/web/package.json').version")"

echo "▸ Web bundle"
( cd "$ROOT/web" && { [ -d node_modules ] || npm install --no-audit --no-fund --silent; } && npm run build --silent )

echo "▸ Android APK"
"$ROOT/android/build.sh"

echo "▸ PWA (for iPhone / any browser — host this folder on any static HTTPS host)"
mkdir -p "$ROOT/releases"
rm -rf "$ROOT/releases/Benjamins-PWA" "$ROOT/releases/Benjamins-PWA-v$VERSION.zip"
cp -R "$ROOT/web/dist/pwa" "$ROOT/releases/Benjamins-PWA"
( cd "$ROOT/releases" && zip -qr "Benjamins-PWA-v$VERSION.zip" Benjamins-PWA )
echo "  releases/Benjamins-PWA/ and releases/Benjamins-PWA-v$VERSION.zip"

if [ "${1:-}" = "--ios" ]; then
  echo "▸ iOS (Simulator)"
  "$ROOT/ios/build.sh"
fi
echo "✓ Done — see releases/"
