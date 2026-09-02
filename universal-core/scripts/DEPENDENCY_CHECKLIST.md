# Build-Machine Dependency Checklist — v1.0.0-RC

Required to execute `scripts/build-all.sh` and `scripts/verify-artifacts.sh`.

## Base
- [ ] Linux build host (Ubuntu 22.04+ / Debian 12+ recommended)
- [ ] `rustup` + `rustc` stable + `cargo`
- [ ] `gcc` / `clang` (native linker)
- [ ] `make` (for Linux harness Makefile)
- [ ] `git` (branch tracking)

## Rust Targets (install via rustup)
- [ ] `rustup target add x86_64-unknown-linux-gnu`
- [ ] `rustup target add aarch64-unknown-linux-gnu`
- [ ] `rustup target add aarch64-linux-android`
- [ ] `rustup target add armv7-linux-androideabi`
- [ ] `rustup target add x86_64-linux-android`
- [ ] `rustup target add aarch64-apple-darwin`
- [ ] `rustup target add x86_64-apple-darwin`
- [ ] `rustup target add x86_64-pc-windows-msvc`
- [ ] `rustup target add mipsel-unknown-linux-musl`
- [ ] `rustup target add armv7-unknown-linux-musleabihf`

## Android (NDK)
- [ ] Android NDK r26+ (`ANDROID_NDK_HOME` set)
- [ ] `aarch64-linux-android-gcc`, `arm-linux-androideabi-gcc`, `x86_64-linux-android-gcc`
- [ ] `ndk-build` or CMake + `android.toolchain.cmake` for `universal-core/android/jni/`

## Apple (macOS / Xcode)
- [ ] macOS 13+ with Xcode 14+
- [ ] `clang` with Apple SDK for `aarch64-apple-darwin` / `x86_64-apple-darwin`
- [ ] `xcodebuild` (for XCFramework packaging of `universal-core/apple/`)

## Windows (MSVC / MinGW)
- [ ] MSVC Build Tools 2022 or MinGW-w64 (`x86_64-w64-mingw32-gcc`)
- [ ] `link.exe` (for `x86_64-pc-windows-msvc`) or `x86_64-w64-mingw32-gcc` (GNU)

## OpenWrt / Embedded
- [ ] OpenWrt SDK (matching device architecture, e.g., `mipsel` / `arm`) with `staging_dir`
- [ ] Cross-compiler `mipsel-openwrt-linux-musl-gcc` / `arm-openwrt-linux-musleabihf-gcc`
- [ ] Router access for `v2rayez-license-gate` binary deployment (`/usr/bin/`)

## Verification / Test
- [ ] `valgrind` (optional, for Linux leak-check of `test_ffi`)
- [ ] `gcc` + `ldd` (for Linux harness linking verification)
- [ ] `python3` (for `verify-artifacts.sh` symbol parsing if extended)
