#!/usr/bin/env bash
# Installs the release APK on the running emulator / connected device and launches it.
#
#   ./install.sh [path/to/app.apk]    default: releases/Benjamins-v<version>.apk
#
# With several devices attached, pick one with ANDROID_SERIAL=emulator-5554 ./install.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
PKG="app.watchyourbenjamins"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$ANDROID_HOME/platform-tools/adb"

APK="${1:-}"
if [ -z "$APK" ]; then
  VERSION="$(sed -n "s/^[[:space:]]*versionName[[:space:]]*=[[:space:]]*['\"]\([^'\"]*\)['\"].*/\1/p" "$HERE/app/build.gradle" | head -1)"
  APK="$ROOT/releases/Benjamins-v$VERSION.apk"
fi
[ -f "$APK" ] || { echo "No APK at $APK — run ./build.sh first" >&2; exit 1; }

if [ -z "${ANDROID_SERIAL:-}" ]; then
  devices="$("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
  [ -n "$devices" ] || { echo "No emulator/device connected (adb devices is empty)" >&2; exit 1; }
  ANDROID_SERIAL="$(echo "$devices" | head -1)"
  [ "$(echo "$devices" | wc -l | tr -d ' ')" = 1 ] || echo "Several devices attached; using $ANDROID_SERIAL (set ANDROID_SERIAL to choose)"
fi
export ANDROID_SERIAL

echo "Installing $(basename "$APK") on $ANDROID_SERIAL …"
if ! out="$("$ADB" install -r "$APK" 2>&1)"; then
  echo "$out" >&2
  if echo "$out" | grep -q 'INSTALL_FAILED_UPDATE_INCOMPATIBLE'; then
    echo "A build of $PKG signed with a different key is installed. Uninstalling it deletes its data:" >&2
    echo "  $ADB uninstall $PKG" >&2
  fi
  exit 1
fi
echo "$out" | tail -1
"$ADB" shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$PKG/.MainActivity" | grep -E 'Status|TotalTime|WaitTime' || true
