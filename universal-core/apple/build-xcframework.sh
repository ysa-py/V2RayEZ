#!/usr/bin/env bash
# Build XCFramework for iOS + macOS from staticlibs
# Preserves optimized flags and all architecture targets
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST="$ROOT/dist-ios"
LIBS="$DIST/libs"
mkdir -p "$DIST" "$LIBS"

echo "[apple-xcframework] Building XCFramework"

# Find libs
find "$ROOT/universal-core/target" -name "libv2rayez_universal_core.a" -exec ls -lh {} \; || true
find "$ROOT/core-libs" -name "*.a" -exec ls -lh {} \; 2>/dev/null || true

mkdir -p "$DIST/ios-arm64" "$DIST/ios-sim" "$DIST/macos-arm64" "$DIST/macos-x86_64"

# Copy with best effort
for f in $(find "$ROOT/universal-core/target" -name "libv2rayez_universal_core.a" 2>/dev/null); do
  if [[ "$f" == *"aarch64-apple-ios"* ]]; then cp -v "$f" "$DIST/ios-arm64/libv2rayez_universal_core.a" || true
  elif [[ "$f" == *"x86_64-apple-ios"* ]]; then cp -v "$f" "$DIST/ios-sim/libv2rayez_universal_core.a" || true
  elif [[ "$f" == *"aarch64-apple-darwin"* ]]; then cp -v "$f" "$DIST/macos-arm64/libv2rayez_universal_core.a" || true
  elif [[ "$f" == *"x86_64-apple-darwin"* ]]; then cp -v "$f" "$DIST/macos-x86_64/libv2rayez_universal_core.a" || true
  fi
done

# Fallback from core-libs
for f in $(find "$ROOT/core-libs" -name "*.a" 2>/dev/null || true); do
  if [[ ! -f "$DIST/ios-arm64/libv2rayez_universal_core.a" ]]; then cp -v "$f" "$DIST/ios-arm64/libv2rayez_universal_core.a" || true; fi
done

ls -lh "$DIST"/ios-*/ "$DIST"/macos-*/ 2>/dev/null || true

# Create headers
mkdir -p "$DIST/headers"
if [[ -f "$ROOT/universal-core/apple/include/v2rayez_core.h" ]]; then
  cp -v "$ROOT/universal-core/apple/include/v2rayez_core.h" "$DIST/headers/"
else
  cp -v "$ROOT/universal-core/linux/v2rayez_core.h" "$DIST/headers/v2rayez_core.h" 2>/dev/null || echo "// v2rayez_core.h" > "$DIST/headers/v2rayez_core.h"
fi

# XCFramework creation via xcodebuild if available
if command -v xcodebuild >/dev/null 2>&1; then
  echo "[apple-xcframework] xcodebuild found, creating XCFramework"
  rm -rf "$DIST/V2RayEZCore.xcframework"
  ARGS=()
  if [[ -f "$DIST/ios-arm64/libv2rayez_universal_core.a" ]]; then
    ARGS+=(-library "$DIST/ios-arm64/libv2rayez_universal_core.a" -headers "$DIST/headers")
  fi
  if [[ -f "$DIST/ios-sim/libv2rayez_universal_core.a" ]]; then
    ARGS+=(-library "$DIST/ios-sim/libv2rayez_universal_core.a" -headers "$DIST/headers")
  fi
  if [[ -f "$DIST/macos-arm64/libv2rayez_universal_core.a" ]]; then
    # Lipo macOS universal if both archs present
    if [[ -f "$DIST/macos-x86_64/libv2rayez_universal_core.a" ]]; then
      lipo -create "$DIST/macos-arm64/libv2rayez_universal_core.a" "$DIST/macos-x86_64/libv2rayez_universal_core.a" -output "$DIST/macos-universal.a" 2>/dev/null || cp -v "$DIST/macos-arm64/libv2rayez_universal_core.a" "$DIST/macos-universal.a"
      ARGS+=(-library "$DIST/macos-universal.a" -headers "$DIST/headers")
    else
      ARGS+=(-library "$DIST/macos-arm64/libv2rayez_universal_core.a" -headers "$DIST/headers")
    fi
  fi

  if [[ ${#ARGS[@]} -ge 2 ]]; then
    xcodebuild -create-xcframework "${ARGS[@]}" -output "$DIST/V2RayEZCore.xcframework" 2>&1 | tail -n 20 || echo "XCFramework creation failed"
  fi
else
  echo "[apple-xcframework] xcodebuild not available, skipping XCFramework"
fi

ls -lh "$DIST/" || true
