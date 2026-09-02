#!/usr/bin/env bash
# Generate SHA256SUMS.txt for all final assets
# Supports .apk, .ipa, .exe, .msi, .ipk, .dll, .a
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

# Find all relevant files
FILES=$(find . -maxdepth 1 -type f \( -name "*.apk" -o -name "*.ipa" -o -name "*.exe" -o -name "*.msi" -o -name "*.ipk" -o -name "*.dll" -o -name "*.a" -o -name "*.so" \) | sort)

if [[ -z "$FILES" ]]; then
  echo "[checksums] No final assets found in $ASSET_DIR"
  find . -type f | head -n 20
  exit 1
fi

echo "[checksums] Found files:"
ls -lh $FILES 2>/dev/null || true

# Generate main SHA256SUMS.txt
sha256sum $FILES > SHA256SUMS.txt
echo "[checksums] SHA256SUMS.txt:"
cat SHA256SUMS.txt

# Per-type checksums
for ext in apk ipa exe msi ipk; do
  if ls *.$ext 1>/dev/null 2>&1; then
    sha256sum *.$ext > SHA256SUMS-${ext^^}.txt
    echo "[checksums] SHA256SUMS-${ext^^}.txt generated"
    cat SHA256SUMS-${ext^^}.txt
  fi
done

echo "[checksums] Done"
