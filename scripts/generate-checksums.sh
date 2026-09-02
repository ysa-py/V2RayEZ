#!/usr/bin/env bash
# Generate SHA256SUMS.txt for all final assets
# Supports .apk, .ipa, .exe, .msi, .ipk, .dll, .a, .tar.gz, .zip, .deb, .rpm, .AppImage
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSET_DIR="${1:-$ROOT/release-assets}"
if [[ ! -d "$ASSET_DIR" ]]; then
  ASSET_DIR="$ROOT/dist"
fi
if [[ ! -d "$ASSET_DIR" ]]; then
  ASSET_DIR="$ROOT"
fi

echo "[checksums] Generating SHA256SUMS in $ASSET_DIR"
mkdir -p "$ASSET_DIR"
cd "$ASSET_DIR"

# Collect all release asset files (excluding existing checksum files)
mapfile -t FILES < <(find . -maxdepth 1 -type f \( \
  -name "*.apk" -o -name "*.ipa" -o -name "*.exe" -o -name "*.msi" -o \
  -name "*.ipk" -o -name "*.dll" -o -name "*.a" -o -name "*.so" -o \
  -name "*.tar.gz" -o -name "*.zip" -o -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" \
  \) ! -name "*.sha256" ! -name "SHA256SUMS*" | sed 's|^\./||' | sort)

if [[ "${#FILES[@]}" -eq 0 ]]; then
  echo "[checksums] No final assets found in $ASSET_DIR"
  find . -maxdepth 2 -type f | head -n 20 || true
  exit 1
fi

echo "[checksums] Found ${#FILES[@]} files:"
for f in "${FILES[@]}"; do
  ls -lh "$f"
done

# Generate main SHA256SUMS.txt with clean relative names
rm -f SHA256SUMS.txt
for f in "${FILES[@]}"; do
  sha256sum "$f" >> SHA256SUMS.txt
done
echo "[checksums] SHA256SUMS.txt generated:"
cat SHA256SUMS.txt

# Per-type checksums
for ext in apk ipa exe msi ipk deb rpm appimage tar.gz zip; do
  mapfile -t TYPE_FILES < <(find . -maxdepth 1 -type f -name "*.$ext" | sed 's|^\./||' | sort)
  if [[ "${#TYPE_FILES[@]}" -gt 0 ]]; then
    ext_upper=$(echo "$ext" | tr '[:lower:]' '[:upper:]' | tr '.' '_')
    rm -f "SHA256SUMS-${ext_upper}.txt"
    for f in "${TYPE_FILES[@]}"; do
      sha256sum "$f" >> "SHA256SUMS-${ext_upper}.txt"
    done
    echo "[checksums] SHA256SUMS-${ext_upper}.txt generated"
  fi
done

echo "[checksums] Done"
