# Cross-Compilation Build Scripts — Shared-Core Phase

This directory contains zero-logic-duplication build automation for the
`v2rayez-universal-core` FFI layer (crate-type: rlib / staticlib / cdylib).

## Targets (5 platform groups)

| Platform | Rust target | Linker / SDK | Artifact |
|---|---|---|---|
| Linux x64 | x86_64-unknown-linux-gnu | gcc | `libv2rayez_universal_core.a` |
| Linux ARM64 | aarch64-unknown-linux-gnu | aarch64-linux-gnu-gcc | `.a` |
| OpenWrt (embedded) | mipsel-unknown-linux-musl | mipsel-openwrt-linux-musl-gcc | `.a` |
| Android ARM64 | aarch64-linux-android | aarch64-linux-android-gcc | `.a` + .so (if cdylib) |
| Android ARMv7 | armv7-linux-androideabi | arm-linux-androideabi-gcc | `.a` |
| Apple ARM64 (iOS/macOS) | aarch64-apple-darwin | clang / Xcode | `.a` / `.dylib` |
| Apple x86_64 | x86_64-apple-darwin | clang / Xcode | `.a` / `.dylib` |
| Windows x64 | x86_64-pc-windows-msvc | link (MSVC) / mingw | `.lib` / `.dll` |

## Memory Ownership Rules (applies to all targets)

- All `v2rayez_core_*` functions return `*mut c_char` owned by Rust.
- Caller must call `v2rayez_free_string` to deallocate.
- Opaque `*mut c_void` session handle owned by Rust; caller must call
  `v2rayez_core_shutdown` to drop (triggers `CoreSession::drop` / graceful shutdown).

## Usage

```bash
# All targets
./universal-core/scripts/build-all.sh

# Single target
./universal-core/scripts/build-all.sh aarch64-apple-darwin
```

## CI Matrix

`.github/workflows/universal-core-ci.yml` builds all targets in parallel
and uploads artifacts per platform group. Symbol verification is deferred
until the build environment has `rustc` / `cargo` (currently missing in
this sandbox, per Milestone-1 report).
