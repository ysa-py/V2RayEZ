# End-to-End Smoke-Test Procedure — 5 Platform Artifacts

This procedure verifies pre-release artifacts produced by the cross-compilation
matrix (CI workflow) against the finalized FFI boundary.

## General Rules (all platforms)

- Zero core logic duplication: smoke tests only call `v2rayez_core_*` / `v2rayez_free_string`.
- Memory safety: every `start`/`status`/`stop` response must be freed; `shutdown` must trigger graceful `Drop`; no use-after-free permitted.
- Use `CoreUIStateMachine` (from `ui_state.rs`) for lifecycle orchestration if available; otherwise call FFI directly.

---

## Linux (Native / Embedded / OpenWrt)

1. Build: `cargo build --target x86_64-unknown-linux-gnu --release` (LTO + strip).
2. Link harness: `gcc -I universal-core/linux test_ffi.c -L target/x86_64-unknown-linux-gnu/release -lv2rayez_universal_core -lpthread -ldl`.
3. Execute: `./test_ffi` → expect `PASS linux-ffi`.
4. Memory check: `valgrind --leak-check=full ./test_ffi` (if available) must show zero leaks from `v2rayez_core_init` through `v2rayez_core_shutdown`.
5. OpenWrt embedded variant: cross-compile with `mipsel-unknown-linux-musl`; run `ffi_validate.sh` inside OpenWrt SDK rootfs.

---

## Android (JNI / aarch64 / armv7 / x86_64)

1. Build: `cargo build --target aarch64-linux-android --release`.
2. Build JNI: `ndk-build` or CMake with `universal-core/android/jni/CMakeLists.txt` linking `libv2rayez_universal_core.a`.
3. Deploy to device / emulator; load library via `NativeBridge` (`System.loadLibrary("v2rayez_core")`).
4. Smoke test:
   - `coreInit()` → non-zero handle.
   - `coreStart(handle, '{"command":"Start"}')` → non-empty JSON.
   - `coreStatus(handle)` → valid JSON.
   - `coreStop(handle)` → non-empty JSON.
   - `coreShutdown(handle)` → handle invalidated; no crash.
5. Memory: Android Studio Memory Profiler must show no native heap growth after 10 start/stop cycles.

---

## Apple (iOS / macOS XCFramework)

1. Build: `cargo build --target aarch64-apple-darwin --release`; package `.a`/`.dylib` into XCFramework.
2. Swift wrapper (`NativeBridge.swift`) uses `deinit` → `v2rayez_core_shutdown`.
3. Smoke test (macOS host or simulator):
   - `let h = V2RayEZCoreHandle()`
   - `h.start(requestJson: ...)` → `String?`
   - `h.status()` → `String?`
   - `h.stop()` → `String?`
   - Deinit: verify no crash; `v2rayez_free_string` called for every returned pointer.
4. Memory: Instruments Allocation tracker must show no persistent `CString` allocations after deinit.

---

## Windows (MSVC / GNU)

1. Build: `cargo build --target x86_64-pc-windows-msvc --release` → `.lib` / `.dll`.
2. C++ wrapper (`V2RayEZCore.h`) RAII: destructor calls `v2rayez_core_shutdown`.
3. Smoke test (Windows desktop):
   - `CoreBinding handle;` → init.
   - `handle.Start(...)` → `std::string`.
   - `handle.Stop()` → `std::string`.
   - `handle.Status()` → `std::string`; every `char*` converted to `std::string` and `v2rayez_free_string` called.
4. C# wrapper (`V2RayEZCore.cs`): use `Task.Run` for `Status()`; `finally` calls `v2rayez_free_string`; destructor shuts down.
5. Memory: Windows Performance Monitor / UWP Memory Inspector must show stable native heap across 20 cycles.

---

## OpenWrt / Embedded Linux (LuCI / systemd)

1. Build: `cargo build --target mipsel-unknown-linux-musl --release` or use OpenWrt SDK.
2. Install binary (`v2rayez-license-gate`) and staticlib to router (`/usr/lib/libv2rayez_universal_core.a`).
3. Init script (`etc/init.d/v2rayez`) starts service; UCI config (`etc/config/v2rayez`) persists settings.
4. Smoke test:
   - `v2rayez-license-gate --mode enforce --device-id ...` → exit 0/1 correctly.
   - `ffi_validate.sh` → `PASS openwrt-ffi`.
   - No memory leaks detected via `valgrind` or router `free` diagnostics.

---

## Release Gate Criteria

- [ ] All 5 artifacts build with `profile.release` (LTO + strip) without errors.
- [ ] `verify-artifacts.sh` passes all checks (symbols + smoke binary + CI config + LTO profile).
- [ ] No new core logic added in any platform glue (only FFI/state-machine usage).
- [ ] Memory ownership contract verified at every layer (init → start → status → stop → shutdown → free).
