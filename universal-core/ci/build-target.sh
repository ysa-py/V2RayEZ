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

# Bash 3.2 (macOS) treats empty "${arr[@]}" as unbound under `set -u`.
run_cargo_build() {
  local triple="$1"
  shift || true
  # Extra cargo args (e.g. --lib) must be passed after the triple.
  if [[ "${USE_NIGHTLY_BUILD_STD:-0}" == "1" ]]; then
    RUSTC_BOOTSTRAP=1 cargo +nightly -Zbuild-std=std,panic_abort build --target "$triple" --release --features "$FEATURES" "$@"
  elif [[ -n "${CARGO_TOOLCHAIN:-}" ]]; then
    cargo "+${CARGO_TOOLCHAIN}" build --target "$triple" --release --features "$FEATURES" "$@"
  else
    cargo build --target "$triple" --release --features "$FEATURES" "$@"
  fi
}

case "$TARGET" in
  x86_64-unknown-linux-gnu)
    rustup target add "$TARGET" || true
    run_cargo_build "$TARGET"
    ;;

  aarch64-unknown-linux-gnu)
    rustup target add "$TARGET"
    if [[ "$(uname -s)" == "Linux" ]]; then
      apt_install gcc-aarch64-linux-gnu
      export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER="${CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER:-aarch64-linux-gnu-gcc}"
    fi
    run_cargo_build "$TARGET"
    ;;

  mipsel-unknown-linux-musl|mipsel-unknown-linux-gnu)
    # Keep OpenWrt in CI. Do not build the license-gate bin or cdylib (those
    # need a full musl sysroot). Emit only libv2rayez_universal_core.a.
    if [[ "$(uname -s)" == "Linux" ]]; then
      apt_install gcc-mipsel-linux-gnu binutils-mipsel-linux-gnu
      export CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_MUSL_LINKER="${CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_MUSL_LINKER:-mipsel-linux-gnu-gcc}"
      export CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_GNU_LINKER="${CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_GNU_LINKER:-mipsel-linux-gnu-gcc}"
      export CC_mipsel_unknown_linux_musl="${CC_mipsel_unknown_linux_musl:-mipsel-linux-gnu-gcc}"
      export CC_mipsel_unknown_linux_gnu="${CC_mipsel_unknown_linux_gnu:-mipsel-linux-gnu-gcc}"
      export AR_mipsel_unknown_linux_musl="${AR_mipsel_unknown_linux_musl:-mipsel-linux-gnu-ar}"
      export AR_mipsel_unknown_linux_gnu="${AR_mipsel_unknown_linux_gnu:-mipsel-linux-gnu-ar}"
      export RUSTFLAGS="${RUSTFLAGS:-} -C target-feature=+crt-static -C linker=mipsel-linux-gnu-gcc -C ar=mipsel-linux-gnu-ar"
    fi
    built=0
    try_openwrt() {
      local tc="$1"
      local triple="$2"
      echo "==== OpenWrt try toolchain=$tc triple=$triple ===="
      rustup toolchain install "$tc" --profile minimal --component rust-src || return 1
      rustc "+$tc" --print target-list | grep -E 'mipsel' || true
      if rustc "+$tc" --print target-list | grep -qx "$triple"; then
        RUSTC_BOOTSTRAP=1 cargo "+$tc" rustc -Zbuild-std=std,panic_abort --lib --release \
          --target "$triple" --features "$FEATURES" -- --crate-type staticlib && return 0
      fi
      return 1
    }
    for tc in nightly stable 1.84.0 1.81.0 1.78.0 1.77.0; do
      if try_openwrt "$tc" mipsel-unknown-linux-musl; then
        built=1
        TARGET=mipsel-unknown-linux-musl
        break
      fi
      if try_openwrt "$tc" mipsel-unknown-linux-gnu; then
        built=1
        TARGET=mipsel-unknown-linux-gnu
        break
      fi
    done
    if [[ "$built" -eq 0 ]]; then
      echo "rustc MIPS triples unavailable; using custom target spec + nightly build-std"
      rustup toolchain install nightly --profile minimal --component rust-src
      SPEC="$ROOT/ci/mipsel-unknown-linux-musl.json"
      RUSTC_BOOTSTRAP=1 cargo +nightly rustc -Zbuild-std=std,panic_abort --lib --release \
        --target "$SPEC" --features "$FEATURES" -- --crate-type staticlib
      TARGET=mipsel-unknown-linux-musl
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
      run_cargo_build "$TARGET"
    else
      echo "ANDROID_NDK_HOME unset; using cross"
      install_cross
      cross build --target "$TARGET" --release --features "$FEATURES"
    fi
    ;;

  aarch64-apple-darwin|x86_64-apple-darwin)
    rustup target add "$TARGET" || true
    uname_s="$(uname -s)"
    case "$uname_s" in
      Darwin|darwin) ;;
      *)
        echo "Apple targets must run on macOS runners (SDK/linker). uname=$uname_s" >&2
        exit 1
        ;;
    esac
    run_cargo_build "$TARGET"
    ;;

  x86_64-pc-windows-msvc)
    rustup target add "$TARGET" || true
    uname_s="$(uname -s)"
    case "$uname_s" in
      MINGW*|MSYS*|CYGWIN*|Windows*|windows*)
        run_cargo_build "$TARGET"
        ;;
      *)
        if cargo xwin --version >/dev/null 2>&1; then
          cargo xwin build --target "$TARGET" --release --features "$FEATURES"
        else
          cargo install cargo-xwin --locked
          cargo xwin build --target "$TARGET" --release --features "$FEATURES"
        fi
        ;;
    esac
    ;;

  *)
    rustup target add "$TARGET" || true
    run_cargo_build "$TARGET"
    ;;
esac

echo "Build finished for $TARGET"
# Avoid SIGPIPE+pipefail false failure (find | head) on macOS bash 3.2.
find target \( -name 'libv2rayez_universal_core.*' -o -name 'v2rayez_universal_core.dll' -o -name 'v2rayez_universal_core.lib' \) -print | sed -n '1,40p' || true
