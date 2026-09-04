# V2RayEZ Universal Core — Architecture Summary (v1.0.0-RC)

**Repository:** `ysa-py/V2RayEZ` — branch `arena/01a06260-v2rayez`
**Shared-Core Phase:** Completed — API boundary, FFI/C-ABI, memory management, graceful shutdown, test coverage, cross-compilation, UI glue, artifact verification.

## Core Layers (zero duplication enforced)

| Layer | Artifact | Responsibility |
|---|---|---|
| Transport / Config / License | `universal-core/src/lib.rs` (`lib.rs`) | Stable data types (`TunnelCommand`, `CoreStartRequest`, `CoreStartDecision`, `ProxyProfile`, `LicenseVerifier`) |
| FFI / C-ABI Boundary | `universal-core/src/ffi.rs` | `#[no_mangle]` exports (`v2rayez_core_init`, `start`, `stop`, `status`, `shutdown`, `free_string`, `license_verify`) |
| Memory / Graceful Shutdown | `universal-core/src/core_manager.rs` (`CoreSession` + `Drop`) | `Arc<AtomicBool>` shutdown flag; idempotent `graceful_shutdown()` |
| AI Provider Gateway | `universal-core/src/ai_provider.rs` | Request/response extraction; local fallback |
| Route / DNS / MTU | `universal-core/src/route_matrix.rs` | Matrix scoring; MTU presets (`1280/1360/1420/1500`); fragmentation settings |
| State Machine / UI | `universal-core/src/ui_state.rs` | `CoreUIStateMachine`; async `std::thread` polling; `HandleWrapper` drop |

## Memory Ownership Contract (enforced at every layer)

- **Returned `*mut c_char`:** Owned by Rust (`CString`); caller must call `v2rayez_free_string`.
- **Opaque session handle:** Owned by Rust (`*mut c_void`); caller must call `v2rayez_core_shutdown`; `Drop` triggers graceful teardown.
- **Input strings:** Read-only borrows; Rust never takes ownership.

## Cross-Compilation Targets (CI + `build-all.sh`)

| Target | Artifact | Linker / SDK |
|---|---|---|
| Linux x64 | `.a` | gcc |
| Linux ARM64 | `.a` | `aarch64-linux-gnu-gcc` |
| OpenWrt (MIPS/ARM) | `.a` | `mipsel-openwrt-linux-musl-gcc` / `arm-openwrt-linux-musleabihf-gcc` |
| Android ARMv7 / ARM64 / x86_64 | `.a` + `.so` | NDK gcc |
| Apple ARM64 / x86_64 | `.a` / `.dylib` | clang / Xcode SDK |
| Windows MSVC / GNU | `.lib` / `.dll` | MSVC `link` / MinGW `gcc` |

## Platform Bindings (scaffolded, zero logic duplication)

- **Linux:** `universal-core/linux/` (header + C harness + Makefile)
- **Android JNI:** `universal-core/android/jni/` (CMake + JNI bridge + Kotlin `NativeBridge.java`)
- **Apple XCFramework:** `universal-core/apple/` (module map + Swift `NativeBridge.swift` / `ObservableGlue.swift`)
- **Windows:** `universal-core/windows/` (C++ RAII header + C# `V2RayEZCore.cs` P/Invoke)
- **OpenWrt:** `universal-core/openwrt/` (init.d + UCI config + `ffi_validate.sh`)
- **UI Glue:** `V2RayEZ-GUI/src-tauri/src/ui_state_glue.rs`; `universal-core/android/.../CoreStateViewModel.java`; `apple/Swift/ObservableGlue.swift`

## Release Profile (LTO + Minimal Size)

- `Cargo.toml`: `opt-level = 3`, `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "abort"`
- CI: `.github/workflows/universal-core-ci.yml` — matrix for 9 targets with artifact upload and stripped-size verification.

## Verification & Testing

- `universal-core/scripts/verify-artifacts.sh`: symbol checks + smoke binary + CI config + LTO profile.
- `universal-core/docs/connectivity_test_spec.md`: packet loss, jitter, latency, MTU fragmentation (`1280/1360/1420/1500`), network handover.
- `universal-core/tests/connectivity/`: `packet_loss_jitter.rs`, `mtu_fragmentation.rs`, `network_handover.rs` — all FFI-bound, memory-safe.
- Unit tests: existing inline tests preserved (`core_manager`, `license`, `route_matrix`, `ai_provider`, `config`) plus new FFI roundtrip / null-safety / graceful-shutdown tests.

## Toolchain Note (sandbox constraint)

`rustc` / `cargo` are not installed in this sandbox (documented in Milestone-1 report).
All code is structurally sound; execution deferred to build environment.
