#!/usr/bin/env bash
# Build Windows .exe + NSIS installer
# Preserves optimized flags: opt-level=s, lto=true, strip=true
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST="$ROOT/dist-windows"
mkdir -p "$DIST"

echo "[windows] Building Windows exe"

retry() {
  local max=3 count=0 delay=10
  while true; do
    if "$@" 2>&1 | tee -a "$ROOT/windows-build.log"; then return 0; fi
    count=$((count+1))
    if [[ $count -ge $max ]]; then echo "[windows] FAILED after $max attempts: $*"; return 1; fi
    echo "[windows] Retry $count/$max after ${delay}s: $*"
    sleep $delay
    delay=$((delay*2))
  done
}

# Build standalone binary
cd "$ROOT/universal-core"
echo "[windows] cargo build --release --bin v2rayez-license-gate"
retry cargo build --release --bin v2rayez-license-gate --features "std,post-quantum-lab"
find target -name "v2rayez-license-gate.exe" -exec ls -lh {} \; || true
find target -name "v2rayez-license-gate.exe" -exec cp -v {} "$DIST/" \; || true
find target -name "v2rayez_universal_core.dll" -exec cp -v {} "$DIST/" \; 2>/dev/null || true
find target -name "v2rayez_universal_core.lib" -exec cp -v {} "$DIST/" \; 2>/dev/null || true
cd "$ROOT"

# Build Tauri if Node available
if [[ -d "$ROOT/V2RayEZ-GUI" && -x "$(command -v npm 2>/dev/null || echo)" ]]; then
  echo "[windows] Building Tauri GUI"
  cd "$ROOT/V2RayEZ-GUI"
  npm ci --ignore-scripts 2>&1 | tail -n 20 || npm install 2>&1 | tail -n 20 || true
  node scripts/prepare-sidecar.mjs 2>&1 | tail -n 20 || true
  node scripts/build-frontend.mjs 2>&1 | tail -n 20 || true
  if command -v npx >/dev/null 2>&1; then
    npx tauri build --bundles nsis,msi 2>&1 | tee -a "$ROOT/windows-build.log" || echo "[windows] Tauri build failed, continuing with cargo binary"
  fi
  cd "$ROOT"
  find "$ROOT/V2RayEZ-GUI/src-tauri/target" -type f \( -name "*.exe" -o -name "*.msi" \) -exec cp -v {} "$DIST/" \; 2>/dev/null || true
  find "$ROOT/V2RayEZ-GUI/src-tauri/target/release/bundle" -type f \( -name "*.exe" -o -name "*.msi" \) -exec cp -v {} "$DIST/" \; 2>/dev/null || true
fi

ls -lh "$DIST/"
if [[ -z "$(ls "$DIST"/*.exe 2>/dev/null)" ]]; then
  echo "[windows] ERROR: No exe produced"
  exit 1
fi

echo "[windows] Build done"
