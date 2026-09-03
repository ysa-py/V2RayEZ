#!/usr/bin/env bash
# Rasterize the canonical V2RayEZ Enterprise mark into every product icon slot.
# Donor project logos are intentionally left untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRAND="$ROOT/brand"
MASTER_ROUNDED="$BRAND/v2rayez-enterprise-icon.png"
MASTER_FULL="$BRAND/v2rayez-enterprise-icon-fullbleed.png"
SVG="$BRAND/v2rayez-logo.svg"
ANDROID_APP="$ROOT/V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)"
TAURI_ICONS="$ROOT/V2RayEZ-GUI/src-tauri/icons"
GUI_ANDROID="$ROOT/V2RayEZ-GUI/android/app/src/main/res"

if [[ ! -f "$MASTER_FULL" || ! -f "$MASTER_ROUNDED" ]]; then
  echo "Missing master brand rasters in $BRAND" >&2
  exit 1
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required tool: $1" >&2; exit 1; }; }
need convert
need identify

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

compress_png() {
  local src="$1" dest="$2" size="${3:-}"
  if [[ -n "$size" ]]; then
    convert "$src" -resize "${size}x${size}" -strip -define png:compression-level=9 "$dest"
  else
    convert "$src" -strip -define png:compression-level=9 "$dest"
  fi
}

# Desktop / store icons use the pre-rounded enterprise mark.
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/icon.png" 512
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/32x32.png" 32
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/64x64.png" 64
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/128x128.png" 128
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/128x128@2x.png" 256
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/Square30x30Logo.png" 30
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/Square44x44Logo.png" 44
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/Square71x71Logo.png" 71
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/Square89x89Logo.png" 89
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/Square107x107Logo.png" 107
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/Square142x142Logo.png" 142
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/Square150x150Logo.png" 150
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/Square284x284Logo.png" 284
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/Square310x310Logo.png" 310
compress_png "$MASTER_ROUNDED" "$TAURI_ICONS/StoreLogo.png" 50

# Multi-size Windows ICO
convert "$MASTER_ROUNDED" \
  \( -clone 0 -resize 256x256 \) \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 64x64 \) \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 16x16 \) \
  -delete 0 -strip "$TAURI_ICONS/icon.ico"

# macOS ICNS when ImageMagick can encode it; otherwise keep a 1024 PNG sidecar.
if convert "$MASTER_ROUNDED" -resize 1024x1024 "$TAURI_ICONS/icon.icns" 2>/dev/null; then
  echo "Wrote $TAURI_ICONS/icon.icns"
else
  echo "ImageMagick could not write ICNS; PNG/ICO slots were still updated."
fi

cp -f "$SVG" "$TAURI_ICONS/icon.svg"
cp -f "$SVG" "$ROOT/V2RayEZ-GUI/src/v2rayez-logo.svg"
cp -f "$SVG" "$ROOT/MICAFP/dashboard/public/logo.svg"

# iOS AppIcon sizes used by the Tauri donor bundle.
ios="$TAURI_ICONS/ios"
if [[ -d "$ios" ]]; then
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-20x20@1x.png" 20
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-20x20@2x.png" 40
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-20x20@2x-1.png" 40
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-20x20@3x.png" 60
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-29x29@1x.png" 29
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-29x29@2x.png" 58
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-29x29@2x-1.png" 58
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-29x29@3x.png" 87
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-40x40@1x.png" 40
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-40x40@2x.png" 80
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-40x40@2x-1.png" 80
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-40x40@3x.png" 120
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-60x60@2x.png" 120
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-60x60@3x.png" 180
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-76x76@1x.png" 76
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-76x76@2x.png" 152
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-83.5x83.5@2x.png" 167
  compress_png "$MASTER_ROUNDED" "$ios/AppIcon-512@2x.png" 1024
fi

# Android adaptive foreground = full-bleed art with safe-zone padding.
adaptive="$work/adaptive.png"
convert "$MASTER_FULL" -gravity center -background "#050816" -extent 1240x1240 -resize 432x432 -strip "$adaptive"

write_android_mipmap() {
  local dest_root="$1"
  local density="$2"
  local size="$3"
  mkdir -p "$dest_root/mipmap-$density"
  compress_png "$MASTER_ROUNDED" "$dest_root/mipmap-$density/ic_launcher.png" "$size"
  compress_png "$MASTER_ROUNDED" "$dest_root/mipmap-$density/ic_launcher_round.png" "$size"
  compress_png "$adaptive" "$dest_root/mipmap-$density/ic_launcher_foreground.png" "$size"
}

for dest in "$TAURI_ICONS/android" "$GUI_ANDROID"; do
  [[ -d "$dest" ]] || continue
  write_android_mipmap "$dest" mdpi 48
  write_android_mipmap "$dest" hdpi 72
  write_android_mipmap "$dest" xhdpi 96
  write_android_mipmap "$dest" xxhdpi 144
  write_android_mipmap "$dest" xxxhdpi 192
done

# Canonical Android product app: nodpi bitmap for adaptive foreground.
mkdir -p "$ANDROID_APP/app/src/main/res/drawable-nodpi"
compress_png "$adaptive" "$ANDROID_APP/app/src/main/res/drawable-nodpi/ic_launcher_art.png" 432

# Browser extensions
for ext in chrome firefox; do
  dir="$ROOT/MICAFP/extensions/$ext/icons"
  [[ -d "$dir" ]] || continue
  compress_png "$MASTER_ROUNDED" "$dir/icon16.png" 16
  compress_png "$MASTER_ROUNDED" "$dir/icon48.png" 48
  compress_png "$MASTER_ROUNDED" "$dir/icon128.png" 128
done

# Compress the masters themselves so the repo stays lean.
compress_png "$MASTER_ROUNDED" "$MASTER_ROUNDED"
compress_png "$MASTER_FULL" "$MASTER_FULL"

echo "V2RayEZ enterprise brand rasterization complete."
identify "$TAURI_ICONS/icon.png" "$TAURI_ICONS/icon.ico" "$ANDROID_APP/app/src/main/res/drawable-nodpi/ic_launcher_art.png"
