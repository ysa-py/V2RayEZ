# Commit / Tag Strategy — Milestone 1 (Shared-Core Completion)

Branch (fixed): `arena/01a06260-v2rayez`

## Commit message convention

- `milestone/1: shared-core completion` — API/FFI, memory, graceful shutdown, tests
- `milestone/1: platform-bindings-scaffold` — Linux/Android/Apple/Windows/OpenWrt
- `milestone/1: cross-compile-ci` — `.cargo/config.toml`, `.github/workflows`, build scripts
- `milestone/1: ui-state-machine` — `ui_state.rs`, glue stubs, design docs
- `milestone/1: artifact-verification` — `verify-artifacts.sh`, `smoke_test_procedure.md`
- `milestone/1: architecture-docs-v1.0.0-rc` — `ARCHITECTURE.md`, `RELEASE_NOTES_v1.0.0-RC.md`

## Recommended single squash commit for RC

```
git add -A
git commit -m "milestone/1: v1.0.0-rc shared-core completion

- Stabilize FFI/C-ABI boundary (ffi.rs), data types, memory ownership
- Implement graceful shutdown (CoreSession + Drop)
- Add core unit tests + connectivity spec + smoke-test procedure
- Scaffold 5 platform bindings (Linux, Android JNI, Apple XCFramework,
  Windows C++/C#, OpenWrt init/UCI)
- Build cross-compilation matrix (.cargo/config, CI workflow, build-all.sh)
- Add LTO + strip release profile; verification script
- UI state machine (ui_state.rs) + platform glue (Tauri/Android/iOS)
- Docs: ARCHITECTURE.md, RELEASE_NOTES_v1.0.0-RC.md, smoke_test_procedure.md"

git tag -a v1.0.0-RC -m "V2RayEZ Universal Core v1.0.0-RC — Shared-Core Completion (Milestone 1)"
git push origin arena/01a06260-v2rayez --tags
```

Constraints respected:
- All work stays on `arena/01a06260-v2rayez` (session branch).
- No core logic duplicated in any binding.
- Memory contract (`v2rayez_free_string` / `shutdown` / `Drop`) preserved at every layer.
