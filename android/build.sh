#!/usr/bin/env bash
# Builds the signed release APK of Benjamins and copies it to releases/Benjamins-v<version>.apk
#
#   ./build.sh               ship web/dist/index.html if it exists, else the bridge test page
#   ./build.sh --test-page   always ship the bridge test page (android/test-page/index.html)
#
# Also copies design/android-res/* over app/src/main/res/ when that folder exists.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
APP="$HERE/app"
WWW="$APP/src/main/assets/www"
RES="$APP/src/main/res"

TEST_PAGE=0
for arg in "$@"; do
  case "$arg" in
    --test-page) TEST_PAGE=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- toolchain
java_major() { "$1/bin/java" -version 2>&1 | sed -n 's/.* version "\([0-9]*\).*/\1/p' | head -1; }
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/java" ] || [ "$(java_major "$JAVA_HOME")" -lt 17 ]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
  [ -n "$JAVA_HOME" ] || JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/jdk-17.0.20+8/Contents/Home"
fi
export JAVA_HOME
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
[ -d "$ANDROID_HOME" ] || { echo "Android SDK not found (set ANDROID_HOME)" >&2; exit 1; }
[ -f "$HERE/local.properties" ] || echo "sdk.dir=$ANDROID_HOME" > "$HERE/local.properties"

if [ ! -f "$HERE/keystore/keystore.properties" ]; then
  echo "Missing android/keystore/keystore.properties (release signing) — see android/keystore/README.md" >&2
  exit 1
fi

# ---------------------------------------------------------------- (a) web bundle
mkdir -p "$WWW"
if [ "$TEST_PAGE" = 0 ] && [ -f "$ROOT/web/dist/index.html" ]; then
  cp "$ROOT/web/dist/index.html" "$WWW/index.html"
  echo "• web:   web/dist/index.html ($(wc -c < "$WWW/index.html" | tr -d ' ') bytes)"
else
  cp "$HERE/test-page/index.html" "$WWW/index.html"
  [ "$TEST_PAGE" = 1 ] && why="--test-page" || why="web/dist/index.html not found"
  echo "• web:   bridge test page ($why)"
fi

# ---------------------------------------------------------------- (b) launcher icon
ICONS="$ROOT/design/android-res"
if [ -d "$ICONS" ] && [ -n "$(ls -A "$ICONS" 2>/dev/null)" ]; then
  # Remove the current launcher icon files first so a replacement of another file type
  # (png/webp vs xml) cannot collide with them ("Duplicate resources").
  find "$RES" -type f -name 'ic_launcher*' -delete
  # Only the res-style subfolders (mipmap-*/, drawable*/, values*/ …); loose files such as a
  # README or preview image at the top level are not valid resources.
  for dir in "$ICONS"/*/; do
    cp -R "${dir%/}" "$RES/"
  done
  find "$RES" -type f -name '.DS_Store' -delete
  for name in ic_launcher ic_launcher_round; do
    # minSdk 26: devices always use the adaptive icon, so density-specific full-bleed
    # legacy bitmaps of the same name can never be picked — drop them to keep the APK small.
    if [ -f "$RES/mipmap-anydpi-v26/$name.xml" ] || [ -f "$RES/mipmap-anydpi/$name.xml" ]; then
      find "$RES" -type f -path '*/mipmap-*dpi/*' \( -name "$name.png" -o -name "$name.webp" \) -delete
    fi
  done
  # The manifest references both names; fall back to the square adaptive icon for "round".
  if [ -z "$(find "$RES" -type f -name 'ic_launcher_round.*' | head -1)" ] && [ -f "$RES/mipmap-anydpi-v26/ic_launcher.xml" ]; then
    cp "$RES/mipmap-anydpi-v26/ic_launcher.xml" "$RES/mipmap-anydpi-v26/ic_launcher_round.xml"
  fi
  echo "• icons: design/android-res"
else
  echo "• icons: placeholder (design/android-res not found)"
fi

# ---------------------------------------------------------------- (c) signed release build
cd "$HERE"
./gradlew --console=plain --warning-mode=summary assembleRelease

# ---------------------------------------------------------------- (d) copy + report
VERSION="$(sed -n "s/^[[:space:]]*versionName[[:space:]]*=[[:space:]]*['\"]\([^'\"]*\)['\"].*/\1/p" "$APP/build.gradle" | head -1)"
SRC="$APP/build/outputs/apk/release/app-release.apk"
OUT="$ROOT/releases/Benjamins-v$VERSION.apk"
mkdir -p "$ROOT/releases"
cp "$SRC" "$OUT"

BT="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
"$BT/apksigner" verify "$OUT"

total=$(wc -c < "$OUT" | tr -d ' ')
web=$(unzip -lv "$OUT" | awk '$8 ~ /^assets\/www\// { s += $3 } END { print s + 0 }')
kb() { awk -v b="$1" 'BEGIN { printf "%.1f KB", b / 1024 }'; }
echo
echo "✔ $OUT"
echo "  APK size:            $total bytes ($(kb "$total"))"
echo "  web assets (zipped): $web bytes ($(kb "$web"))"
echo "  shell without web:   $((total - web)) bytes ($(kb $((total - web))))"
