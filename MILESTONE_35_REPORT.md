# Milestone 35 Report — Universal Release Artifact Build Contract

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Define one honest release-artifact build contract for the required deliverables — Android `.apk`, iOS `.ipa`, Windows `.exe`, Linux package, OpenWrt LuCI `.ipk`, dashboard, and browser extensions — while avoiding fake artifacts when toolchains/signing credentials are unavailable in the sandbox.

## Changes Applied

- Added `scripts/build-release-artifacts.sh`.
- The orchestrator supports:
  - `--target all|android|ios|windows|linux|openwrt|dashboard|extensions`
  - `--artifacts` / `--out-dir`
  - `--check`
  - `ARTIFACT_DIR`, `VERSION`, `OPENWRT_SDK`, and `V2RAYEZ_WINDOWS_BUILDER` environment controls.
- Android target:
  - runs the canonical base V2RayEZ Android Gradle project: `./gradlew :app:assembleRelease`.
  - copies release `.apk` outputs.
- iOS target:
  - requires `xcodegen` and `xcodebuild`.
  - generates the Xcode project, archives, exports via `ExportOptions.plist`, and copies `.ipa` outputs.
- Windows target:
  - requires real Node/Tauri/Rust tooling.
  - refuses non-Windows hosts unless explicitly configured as a cross-builder.
  - runs `npm run build:windows` and copies NSIS `.exe` outputs.
- Linux target:
  - runs `npm run build:linux` and copies `.deb`, `.rpm`, and `.AppImage` outputs.
- OpenWrt target:
  - delegates to the SDK-backed `MICAFP/scripts/package-openwrt.sh` and copies `*unifiedshield*.ipk` outputs.
- Dashboard and browser-extension targets:
  - run real production build commands and package build directories as tarballs.
- The script writes `SHA256SUMS.txt` for all collected artifacts.
- Added `tools/release_artifact_contract_gate.mjs` to statically enforce required artifact formats/commands and reject placeholder-artifact patterns.
- Added the release artifact contract gate and script `--check` mode to the CI sample workflow.

## Validation Run

```bash
bash -n scripts/build-release-artifacts.sh
scripts/build-release-artifacts.sh --check
node --check tools/release_artifact_contract_gate.mjs
node tools/release_artifact_contract_gate.mjs
node --check tools/openwrt_packaging_gate.mjs
node tools/openwrt_packaging_gate.mjs
MICAFP/scripts/package-openwrt.sh --check
node --check tools/android_ai_settings_migration_gate.mjs
node tools/android_ai_settings_migration_gate.mjs
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node --check tools/license_serial_e2e_selftest.mjs
node tools/license_serial_e2e_selftest.mjs
node --check tools/v2rayez_identity_gate.mjs
node tools/v2rayez_identity_gate.mjs
npm test --prefix V2RayEZ-GUI
git diff --check
```

Result: PASS.

## Scope Note

This milestone provides the real build contract and target orchestration. It does not claim generated native artifacts because the sandbox lacks Java/Android SDK, Rust/Tauri, Xcode/signing, Windows builder, OpenWrt SDK, and target devices. The script is intentionally fail-closed for missing toolchains so release evidence remains truthful.
