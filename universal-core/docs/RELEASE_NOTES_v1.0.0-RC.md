# V2RayEZ Universal Core — v1.0.0-RC Release Notes

## Milestone: Shared-Core Completion (Phase 1 sealed)

**Branch:** `arena/01a06260-v2rayez`  
**Commit base:** `bb20a05c1453d57bbf23bc6600cfb2776de1a722` (main)  
**Status:** RC — core tests structurally complete; execution requires `rustc`/`cargo` in build environment.

### What's Sealed

1. **API Boundary & FFI/C-ABI** (`universal-core/src/ffi.rs`)
   - 7 exported `#[no_mangle] extern "C"` symbols.
   - Memory ownership contract documented per function.
   - `staticlib` + `cdylib` crate types preserved.

2. **Resource Management / Graceful Shutdown** (`core_manager.rs` — `CoreSession` + `Drop`)
   - `Arc<AtomicBool>` shutdown flag; idempotent `graceful_shutdown()`.
   - `Drop` triggers safe teardown; null-safe in FFI.

3. **Test Coverage**
   - Existing inline tests preserved (all 5 source modules).
   - New FFI roundtrip, null-safety, memory-ownership, graceful-shutdown tests.
   - Connectivity spec (`docs/connectivity_test_spec.md`) + 3 stub integration test modules.

4. **Cross-Compilation & CI**
   - `.cargo/config.toml` targets: Linux x64/ARM64, Android x3, Apple x2, Windows, OpenWrt.
   - `scripts/build-all.sh` + `README.md`.
   - `.github/workflows/universal-core-ci.yml`: full matrix + artifact upload + LTO verification.
   - `Cargo.toml` release profile: `lto = true`, `strip = true`, `codegen-units = 1`, `panic = "abort"`.

5. **Platform Bindings (scaffolded, zero logic duplication)**
   - Linux harness + Android JNI + Apple XCFramework (Swift) + Windows C++/C# + OpenWrt init/UCI.

6. **UI Integration Glue**
   - `ui_state.rs`: `CoreUIStateMachine` with async `std::thread` polling.
   - Tauri commands (`ui_state_glue.rs`), Kotlin `CoreStateViewModel.kt`, Swift `ObservableGlue.swift`.

7. **Artifact Verification**
   - `scripts/verify-artifacts.sh`: symbol + binary + CI + profile checks.
   - `docs/smoke_test_procedure.md`: 5-platform smoke-test procedure with memory gates.

### What's Not Yet Executed (toolchain dependency)

- `cargo test` / `cargo build --release` for all targets.
- Real-world E2E traffic tests (requires VPN endpoint + real device/simulator).
- Android JNI compilation (requires NDK + `aapt2` for APK build).
- Apple XCFramework packaging (requires Xcode / `xcodebuild`).
- Windows `.dll` build (requires MSVC / Mingw assembler).
- OpenWrt SDK cross-build (requires `staging_dir` / `SDK` installation).

### Breaking Changes from Base

None at core-data level. All public types (`TunnelCommand`, `CoreStartRequest`, `CoreStartDecision`, `ProxyProfile`, etc.) retain original schemas. FFI layer is additive only.

### Dependency Checklist (build machine)

See `ARCHITECTURE.md` and `docs/smoke_test_procedure.md`. Key items:
- `rustup` with stable toolchain + targets (`aarch64-linux-android`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`, `mipsel-unknown-linux-musl`, etc.)
- Android NDK (for `aarch64-linux-android` / `armv7-linux-androideabi`)
- Apple SDK / Xcode (for `aarch64-apple-darwin` / `x86_64-apple-darwin`)
- MSVC / MinGW (for Windows targets)
- OpenWrt SDK (for embedded targets)
