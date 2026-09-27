#!/usr/bin/env bash
# Copies the web bundle and design assets into the iOS app sources (idempotent: only what changed).
# Run by ios/build.sh and by the Xcode build phase "Sync web bundle & icons", so plain Xcode builds
# pick them up too.
#   web/dist/index.html              -> Benjamins/www/index.html  (WYB_SELFTEST=1: ios/selftest/index.html)
#   design/ios/AppIcon-1024[-dark|-tinted].png -> Assets.xcassets/AppIcon.appiconset
#   design/icon/splash-glyph.png|svg -> Assets.xcassets/SplashGlyph.imageset (launch screen + launch cover)
set -euo pipefail

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(dirname "$IOS_DIR")"
APP="$IOS_DIR/Benjamins"
ASSETS="$APP/Assets.xcassets"
GLYPH_PT="${WYB_SPLASH_GLYPH_PT:-176}" # launch-screen glyph canvas size in points

say() { echo "sync-assets: $*"; }

copy_if_changed() { # <src> <dst>
  if ! cmp -s "$1" "$2"; then
    cp "$1" "$2"
    say "updated ${2#"$IOS_DIR/"}"
  fi
}

write_if_changed() { # <dst>, content on stdin
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  if cmp -s "$tmp" "$1"; then rm -f "$tmp"; else mv "$tmp" "$1"; chmod 644 "$1"; say "updated ${1#"$IOS_DIR/"}"; fi
}

# --- 1. Web bundle -------------------------------------------------------------------------------
mkdir -p "$APP/www"
if [ "${WYB_SELFTEST:-0}" = "1" ]; then
  copy_if_changed "$IOS_DIR/selftest/index.html" "$APP/www/index.html"
  say "bundling the self-test page"
elif [ -f "$ROOT/web/dist/index.html" ]; then
  copy_if_changed "$ROOT/web/dist/index.html" "$APP/www/index.html"
else
  [ -f "$APP/www/index.html" ] || cp "$IOS_DIR/selftest/index.html" "$APP/www/index.html"
  say "web/dist/index.html not found - keeping the current www/index.html"
fi

# --- 2. App icon (single-size 1024 universal, optional dark/tinted variants) ----------------------
ICONSET="$ASSETS/AppIcon.appiconset"
if [ -f "$ROOT/design/ios/AppIcon-1024.png" ]; then
  entries=""
  for variant in "" dark tinted; do
    name="AppIcon-1024${variant:+-$variant}.png"
    src="$ROOT/design/ios/$name"
    if [ ! -f "$src" ]; then
      rm -f "$ICONSET/$name"
      continue
    fi
    work="$(mktemp -d)"
    cp "$src" "$work/icon.png"
    read -r w h < <(sips -g pixelWidth -g pixelHeight "$work/icon.png" | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w, h}')
    if [ "$w" != 1024 ] || [ "$h" != 1024 ]; then
      sips -z 1024 1024 "$work/icon.png" >/dev/null
      say "warning: $name is ${w}x${h}, scaled to 1024x1024"
    fi
    copy_if_changed "$work/icon.png" "$ICONSET/$name"
    rm -rf "$work"
    appearance=""
    if [ -n "$variant" ]; then
      appearance='"appearances" : [ { "appearance" : "luminosity", "value" : "'"$variant"'" } ], '
    fi
    entries="$entries${entries:+,}
    { $appearance\"filename\" : \"$name\", \"idiom\" : \"universal\", \"platform\" : \"ios\", \"size\" : \"1024x1024\" }"
  done
  if sips -g hasAlpha "$ICONSET/AppIcon-1024.png" | grep -q 'hasAlpha: yes'; then
    say "warning: AppIcon-1024.png has an alpha channel - App Store icons must be opaque"
  fi
  printf '{\n  "images" : [%s\n  ],\n  "info" : {\n    "author" : "xcode",\n    "version" : 1\n  }\n}\n' "$entries" |
    write_if_changed "$ICONSET/Contents.json"
fi

# --- 3. Splash glyph (optional; without it the launch screen is plain #05050A) --------------------
GLYPH_SET="$ASSETS/SplashGlyph.imageset"
GLYPH_SRC=""
for candidate in "$ROOT/design/icon/splash-glyph.png" "$ROOT/design/icon/splash-glyph.svg"; do
  if [ -f "$candidate" ]; then GLYPH_SRC="$candidate"; break; fi
done
if [ -n "$GLYPH_SRC" ]; then
  mkdir -p "$GLYPH_SET"
  if [ ! -f "$GLYPH_SET/SplashGlyph@3x.png" ] || [ "$GLYPH_SRC" -nt "$GLYPH_SET/SplashGlyph@3x.png" ]; then
    master="$GLYPH_SRC"
    if [ "${GLYPH_SRC##*.}" = svg ]; then
      # SVG filters/gradients need a browser engine: rasterize @3x with WebKit (macOS SDK, clean env
      # because Xcode build phases export iOS SDK settings).
      master="$(mktemp -d)/glyph.png"
      if ! env -i PATH=/usr/bin:/bin HOME="$HOME" ${DEVELOPER_DIR:+DEVELOPER_DIR="$DEVELOPER_DIR"} \
        /usr/bin/xcrun --sdk macosx swift "$IOS_DIR/scripts/svg2png.swift" "$GLYPH_SRC" "$master" $((GLYPH_PT * 3)); then
        say "warning: could not rasterize ${GLYPH_SRC#"$ROOT/"} - keeping the current SplashGlyph"
        master=""
      fi
    fi
    if [ -n "$master" ]; then
      for scale in 1 2 3; do
        sips -Z $((GLYPH_PT * scale)) "$master" --out "$GLYPH_SET/SplashGlyph@${scale}x.png" >/dev/null
      done
      [ "$master" = "$GLYPH_SRC" ] || rm -rf "$(dirname "$master")"
      say "updated SplashGlyph.imageset from ${GLYPH_SRC#"$ROOT/"} (${GLYPH_PT}pt)"
    fi
  fi
  write_if_changed "$GLYPH_SET/Contents.json" <<'JSON'
{
  "images" : [
    { "filename" : "SplashGlyph@1x.png", "idiom" : "universal", "scale" : "1x" },
    { "filename" : "SplashGlyph@2x.png", "idiom" : "universal", "scale" : "2x" },
    { "filename" : "SplashGlyph@3x.png", "idiom" : "universal", "scale" : "3x" }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
JSON
elif [ -d "$GLYPH_SET" ]; then
  rm -rf "$GLYPH_SET"
  say "removed SplashGlyph.imageset (no design/icon/splash-glyph.png/.svg)"
fi
