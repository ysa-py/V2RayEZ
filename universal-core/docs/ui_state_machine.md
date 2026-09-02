# UI State Machine Design — Platform-Agnostic Core Lifecycle

**Binding rule:** Every operation delegates exclusively to `universal-core/src/ffi.rs`
exported symbols (`v2rayez_core_init`, `start`, `stop`, `status`, `shutdown`,
`v2rayez_free_string`). No transport logic, licensing, or config logic is
reimplemented in the UI layer.

## States

```
Uninitialized → Initialized → Started → Stopped → ShuttingDown → Uninitialized
                     ↑_____________________________________| (restart)
```

- `Initialized`: handle allocated via `v2rayez_core_init()`.
- `Started`: `v2rayez_core_start()` accepted.
- `Stopped`: `v2rayez_core_stop()` returned.
- `ShuttingDown`: `v2rayez_core_shutdown()` called; `Drop` triggers
  `graceful_shutdown()` on `CoreSession`.
- `Error(String)`: any FFI null/invalid response captured; handle preserved
  until explicit shutdown.

## Async Polling (Off Main UI Thread)

A dedicated `std::thread` (compatible with Tauri commands, Android JNI
callbacks, iOS GCD, Windows threads, OpenWrt shell) performs periodic
`v2rayez_core_status()` calls. Results are written into an
`Arc<Mutex<CoreLifecycleState>>` shared with the UI layer. The UI reads
from the shared state without blocking the polling loop.

- Poll interval: 2000 ms (configurable).
- Every returned `*mut c_char` is converted to `String`, then immediately
  freed with `v2rayez_free_string`.
- The polling thread never calls `v2rayez_core_shutdown`; only the main
  lifecycle manager does that, ensuring the handle isn't dropped mid-read.

## Platform Integration Notes

| Platform | Integration Path | Async Mechanism |
|---|---|---|
| Linux / Tauri (desktop) | `src-tauri/src/lib.rs` calls `ui_state.rs` methods; front-end reads via Tauri event | `std::thread` + `Mutex` |
| Android (JNI) | `NativeBridge.java` calls `CoreLifecycleMachine` via JNI bridge; updates posted to `Handler`/`LiveData` | JNI thread pool |
| iOS (Swift / XCFramework) | `NativeBridge.swift` wraps `V2RayEZCoreHandle`; `status()` runs on background `DispatchQueue` | `DispatchQueue.global()` |
| Windows (C#/C++) | `V2RayEZCore.cs` or C++ `CoreBinding`; `Status()` called from `Task.Run` / background thread | `Task` / `std::thread` |
| OpenWrt / embedded | `ffi_validate.sh` validates; init script calls binary; no continuous polling needed | `procd` / shell |

## Memory Safety Guarantees

1. Handle ownership is single-threaded: only the state-machine owner calls
   `v2rayez_core_shutdown`; polling thread only reads `status()`.
2. All returned strings are freed before leaving the FFI layer.
3. `Drop` on `CoreSession` (called via shutdown) is idempotent and safe.
