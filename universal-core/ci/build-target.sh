#!/usr/bin/env bash
# Cross-build helper for v2rayez-universal-core. Preserves every platform matrix
# entry; installs/configures the matching linker instead of dropping targets.
set -euo pipefail

TARGET="${1:?target triple required}"
FEATURES="${2:-std,post-quantum-lab}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export CARGO_TERM_COLOR="${CARGO_TERM_COLOR:-always}"

need_cmd() { command -v "$1" >/dev/null 2>&1; }

apt_install() {
  if need_cmd apt-get; then
    sudo apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  fi
}

install_cross() {
  if ! need_cmd cross; then
    cargo install cross --locked --git https://github.com/cross-rs/cross || cargo install cross --locked
  fi
}

build_cargo() {
  local extra=()
  if [[ "${USE_NIGHTLY_BUILD_STD:-0}" == "1" ]]; then
    extra+=(+nightly -Zbuild-std=std,panic_abort)
  fi
  cargo "${extra[@]}" build --target "$TARGET" --release --features "$FEATURES"
}

case "$TARGET" in
  x86_64-unknown-linux-gnu)
    rustup target add "$TARGET" || true
    build_cargo
    ;;

  aarch64-unknown-linux-gnu)
    rustup target add "$TARGET"
    if [[ "$(uname -s)" == "Linux" ]]; then
      apt_install gcc-aarch64-linux-gnu
      export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER="${CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER:-aarch64-linux-gnu-gcc}"
    fi
    build_cargo
    ;;

  mipsel-unknown-linux-musl|mipsel-unknown-linux-gnu)
    # OpenWrt: prefer musl; fall back to gnu + static if rustup has no musl triple.
    if rustup target add mipsel-unknown-linux-musl 2>/dev/null; then
      TARGET=mipsel-unknown-linux-musl
    elif rustup target add mipsel-unknown-linux-gnu 2>/dev/null; then
      TARGET=mipsel-unknown-linux-gnu
    else
      rustup toolchain install nightly --component rust-src
      rustup target add mipsel-unknown-linux-musl --toolchain nightly || true
      export USE_NIGHTLY_BUILD_STD=1
      TARGET=mipsel-unknown-linux-musl
    fi
    if [[ "$(uname -s)" == "Linux" ]]; then
      apt_install gcc-mipsel-linux-gnu
      export CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_MUSL_LINKER="${CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_MUSL_LINKER:-mipsel-linux-gnu-gcc}"
      export CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_GNU_LINKER="${CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_GNU_LINKER:-mipsel-linux-gnu-gcc}"
      export RUSTFLAGS="${RUSTFLAGS:-} -C target-feature=+crt-static"
    fi
    if ! build_cargo; then
      echo "direct mipsel build failed; retrying with cross"
      install_cross
      TARGET=mipsel-unknown-linux-gnu
      rustup target add "$TARGET" || true
      cross build --target "$TARGET" --release --features "$FEATURES"
    fi
    ;;

  aarch64-linux-android|armv7-linux-androideabi|x86_64-linux-android)
    rustup target add "$TARGET"
    if [[ -n "${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-}}" ]]; then
      NDK="${ANDROID_NDK_HOME:-$ANDROID_NDK_ROOT}"
      HOST_TAG="$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)"
      case "$HOST_TAG" in
        linux-x86_64|linux-amd64) HOST_TAG=linux-x86_64 ;;
        darwin-arm64) HOST_TAG=darwin-x86_64 ;;
      esac
      PRE="$NDK/toolchains/llvm/prebuilt/${HOST_TAG}/bin"
      API=24
      case "$TARGET" in
        aarch64-linux-android)
          export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$PRE/aarch64-linux-android${API}-clang"
          export CC_aarch64_linux_android="$PRE/aarch64-linux-android${API}-clang"
          export AR_aarch64_linux_android="$PRE/llvm-ar"
          ;;
        armv7-linux-androideabi)
          export CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER="$PRE/armv7a-linux-androideabi${API}-clang"
          export CC_armv7_linux_androideabi="$PRE/armv7a-linux-androideabi${API}-clang"
          export AR_armv7_linux_androideabi="$PRE/llvm-ar"
          ;;
        x86_64-linux-android)
          export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$PRE/x86_64-linux-android${API}-clang"
          export CC_x86_64_linux_android="$PRE/x86_64-linux-android${API}-clang"
          export AR_x86_64_linux_android="$PRE/llvm-ar"
          ;;
      esac
      build_cargo
    else
      echo "ANDROID_NDK_HOME unset; using cross"
      install_cross
      cross build --target "$TARGET" --release --features "$FEATURES"
    fi
    ;;

  aarch64-apple-darwin|x86_64-apple-darwin)
    rustup target add "$TARGET"
    if [[ "$(uname -s)" != "Darwin" ]]; then
      echo "Apple targets must run on macOS runners (SDK/linker)." >&2
      exit 1
    fi
    build_cargo
    ;;

  x86_64-pc-windows-msvc)
    rustup target add "$TARGET"
    if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == CYGWIN* || "$(uname -s)" == Windows* ]]; then
      build_cargo
    elif need_cmd cargo-xwin || cargo xwin --version >/dev/null 2>&1; then
      cargo xwin build --target "$TARGET" --release --features "$FEATURES"
    else
      cargo install cargo-xwin --locked
      cargo xwin build --target "$TARGET" --release --features "$FEATURES"
    fi
    ;;

  *)
    rustup target add "$TARGET" || true
    build_cargo
    ;;
esac

echo "Build finished for $TARGET"
find target -name 'libv2rayez_universal_core.*' -o -name 'v2rayez_universal_core.dll' -o -name 'v2rayez_universal_core.lib' | head
