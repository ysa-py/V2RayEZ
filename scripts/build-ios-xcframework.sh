#!/usr/bin/env bash
# Build iOS XCFramework from staticlibs
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist-ios"
LIBS="$DIST/libs"
mkdir -p "$DIST" "$LIBS"

echo "[ios-xcframework] Building XCFramework from libs in $LIBS"
ls -lh "$LIBS" 2>/dev/null || true
mkdir -p "$ROOT/universal-core/target" "$ROOT/core-libs"
find "$ROOT/universal-core/target" -name "libv2rayez_universal_core.a" -exec ls -lh {} \; 2>/dev/null || true

# Collect libs
mkdir -p "$DIST/ios-arm64" "$DIST/ios-sim-arm64" "$DIST/ios-sim-x86_64"
# Find best matching libs
find "$ROOT/universal-core/target" -path "*aarch64-apple-ios/release/*.a" -exec cp -v {} "$DIST/ios-arm64/libv2rayez_universal_core.a" \; 2>/dev/null || true
find "$ROOT/universal-core/target" -path "*x86_64-apple-ios/release/*.a" -exec cp -v {} "$DIST/ios-sim-x86_64/libv2rayez_universal_core.a" \; 2>/dev/null || true
find "$ROOT/universal-core/target" -path "*aarch64-apple-ios-sim/release/*.a" -exec cp -v {} "$DIST/ios-sim-arm64/libv2rayez_universal_core.a" \; 2>/dev/null || true

# Fallback to darwin libs if ios libs not found
if [[ ! -f "$DIST/ios-arm64/libv2rayez_universal_core.a" ]]; then
  find "$ROOT/universal-core/target" -path "*aarch64-apple-darwin/release/*.a" -exec cp -v {} "$DIST/ios-arm64/libv2rayez_universal_core.a" \; 2>/dev/null || true
  find "$ROOT/core-libs" -name "*.a" -exec cp -v {} "$DIST/ios-arm64/libv2rayez_universal_core.a" \; 2>/dev/null || true
fi
if [[ ! -f "$DIST/ios-sim-x86_64/libv2rayez_universal_core.a" ]]; then
  find "$ROOT/universal-core/target" -path "*x86_64-apple-darwin/release/*.a" -exec cp -v {} "$DIST/ios-sim-x86_64/libv2rayez_universal_core.a" \; 2>/dev/null || true
fi

ls -lh "$DIST"/ios-*/ || true

# Create XCFramework if xcodebuild available
if command -v xcodebuild >/dev/null 2>&1; then
  echo "[ios-xcframework] Creating XCFramework via xcodebuild"
  rm -rf "$DIST/V2RayEZCore.xcframework"
  # Prepare headers
  mkdir -p "$DIST/headers"
  cp -v "$ROOT/universal-core/apple/include/v2rayez_core.h" "$DIST/headers/" 2>/dev/null || cp -v "$ROOT/universal-core/linux/v2rayez_core.h" "$DIST/headers/v2rayez_core.h" || echo "// header" > "$DIST/headers/v2rayez_core.h"

  args=()
  if [[ -f "$DIST/ios-arm64/libv2rayez_universal_core.a" ]]; then
    args+=(-library "$DIST/ios-arm64/libv2rayez_universal_core.a" -headers "$DIST/headers")
  fi
  if [[ -f "$DIST/ios-sim-arm64/libv2rayez_universal_core.a" && -f "$DIST/ios-sim-x86_64/libv2rayez_universal_core.a" ]]; then
    # Lipo simulator libs
    lipo -create "$DIST/ios-sim-arm64/libv2rayez_universal_core.a" "$DIST/ios-sim-x86_64/libv2rayez_universal_core.a" -output "$DIST/ios-sim-universal.a" 2>/dev/null || cp -v "$DIST/ios-sim-x86_64/libv2rayez_universal_core.a" "$DIST/ios-sim-universal.a"
    args+=(-library "$DIST/ios-sim-universal.a" -headers "$DIST/headers")
  elif [[ -f "$DIST/ios-sim-x86_64/libv2rayez_universal_core.a" ]]; then
    args+=(-library "$DIST/ios-sim-x86_64/libv2rayez_universal_core.a" -headers "$DIST/headers")
  fi

  if [[ ${#args[@]} -ge 2 ]]; then
    xcodebuild -create-xcframework "${args[@]}" -output "$DIST/V2RayEZCore.xcframework" 2>&1 | tail -n 30 || echo "XCFramework creation failed, continuing"
  else
    echo "[ios-xcframework] Not enough libs to create XCFramework, skipping"
  fi
else
  echo "[ios-xcframework] xcodebuild not available, skipping XCFramework creation"
fi

ls -lh "$DIST/" || true
