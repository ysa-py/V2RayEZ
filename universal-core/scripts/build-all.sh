#!/bin/bash
#!/usr/bin/env bash
# Cross-compilation build script for universal-core FFI artifacts.
# Usage: ./build-all.sh [target]
# Produces staticlib + cdylib per target. Zero logic duplication.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGETS=(
  "x86_64-unknown-linux-gnu"
  "aarch64-unknown-linux-gnu"
  "aarch64-linux-android"
  "armv7-linux-androideabi"
  "x86_64-linux-android"
  "aarch64-apple-darwin"
  "x86_64-apple-darwin"
  "x86_64-pc-windows-msvc"
  "mipsel-unknown-linux-musl"
)

BUILD_DIR="${REPO_ROOT}/target"

build_target() {
  local t="$1"
  echo "=== Building universal-core for ${t} ==="
  cd "${REPO_ROOT}"
  # Install target if missing (requires rustup)
  rustup target add "${t}" 2>/dev/null || true
  cargo build --target "${t}" --release \
    --features "std,post-quantum-lab" \
    2>&1 | tail -n 5 || echo "WARN: build failed for ${t} (toolchain may be missing)"
  # Artifact paths for CI consumption
  echo "Artifacts: ${BUILD_DIR}/${t}/release/libv2rayez_universal_core.a"
  echo "            ${BUILD_DIR}/${t}/release/libv2rayez_universal_core.so (Linux) / .dll (Win) / .dylib (Apple)"
}

if [ -n "${1:-}" ]; then
  build_target "$1"
else
  for t in "${TARGETS[@]}"; do
    build_target "$t" || true
  done
fi
