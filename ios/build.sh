#!/usr/bin/env bash
# Builds Benjamins for the iOS Simulator, installs it on the booted simulator and launches it.
#
#   ios/build.sh               bundle web/dist/index.html if it exists, else keep the current page
#   ios/build.sh --selftest    bundle the shell self-test page (ios/selftest/index.html)
#   ios/build.sh --release     Release configuration instead of Debug
#   ios/build.sh --no-launch   build + install only
#   SIMULATOR=<udid> ios/build.sh     target a specific simulator (default: the booted one)
#   ios/build.sh -- -WYBQuery theme=light   pass launch arguments to the app (Debug test hooks)
set -euo pipefail

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ID="app.watchyourbenjamins"
CONFIG="Debug"
SELFTEST=0
LAUNCH=1
LAUNCH_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --selftest) SELFTEST=1 ;;
    --release) CONFIG="Release" ;;
    --no-launch) LAUNCH=0 ;;
    --) shift; LAUNCH_ARGS=("$@"); break ;;
    -h | --help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

# 1. Web bundle + icons -> app sources
WYB_SELFTEST="$SELFTEST" "$IOS_DIR/scripts/sync-assets.sh"

# 2. Pick the simulator (boot the first available iPhone if none is running)
UUID_RE='[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}'
UDID="${SIMULATOR:-}"
if [ -z "$UDID" ]; then
  UDID="$(xcrun simctl list devices booted | grep -Eo "$UUID_RE" | head -n 1 || true)"
fi
if [ -z "$UDID" ]; then
  UDID="$(xcrun simctl list devices available | grep -E '^ +iPhone' | grep -Eo "$UUID_RE" | head -n 1 || true)"
  if [ -z "$UDID" ]; then
    echo "No iPhone simulator available - add one in Xcode > Window > Devices and Simulators." >&2
    exit 1
  fi
  echo "Booting simulator $UDID"
  xcrun simctl boot "$UDID"
  open -a Simulator
fi

# 3. Build (simulator builds need no signing)
DERIVED="$IOS_DIR/build/DerivedData"
echo "Building $CONFIG for simulator $UDID ..."
xcodebuild -quiet \
  -project "$IOS_DIR/Benjamins.xcodeproj" -scheme Benjamins -configuration "$CONFIG" \
  -destination "id=$UDID" -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO WYB_SELFTEST="$SELFTEST" \
  build
APP="$DERIVED/Build/Products/$CONFIG-iphonesimulator/Benjamins.app"

# 4. Install + launch
xcrun simctl install "$UDID" "$APP"
echo "Installed $APP"
if [ "$LAUNCH" = 1 ]; then
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" ${LAUNCH_ARGS[@]+"${LAUNCH_ARGS[@]}"}
fi
