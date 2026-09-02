# Milestone 38 Report — Cross-Platform Client Last Server-Time Propagation

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Make the dashboard server-time rollback guard actionable by having runtime clients send their last trusted validation server time and preserve that time across online/grace validations. This closes a gap where the dashboard accepted `clientLastServerTime`, but several platform clients did not yet provide it.

## Changes Applied

### Desktop / Tauri

- `V2RayEZ-GUI/src-tauri/src/license.rs`
  - sends `clientLastServerTime` on online validation when a previous trusted server time exists.
  - keeps existing storage of successful `serverTime` values.
  - keeps offline grace rollback detection through `LicenseVerifier::offline_start_decision`.

### Android

- `AndroidLicenseRepository.kt`
  - stores successful validation `serverTime` in app preferences.
  - sends stored `clientLastServerTime` to the dashboard on later validations.
  - clears stored server time when the activated serial is cleared.
  - rejects offline grace tokens whose embedded `serverTime` is older than the last trusted server time beyond the five-minute rollback window.

### iOS app and Network Extension

- `LicenseManager.swift`
  - stores successful validation `serverTime` in shared defaults.
  - sends `clientLastServerTime` during online validation.
  - clears stored server time when the serial is cleared.
  - rejects stale grace tokens with `server_time_rollback_detected`.
- `ExtensionLicenseGate.swift`
  - sends `clientLastServerTime` from the shared app group defaults.
  - stores successful validation `serverTime`.
  - refuses stale grace tokens from the Network Extension enforcement path.

### OpenWrt LuCI/package runtime

- `files/etc/config/unifiedshield`
  - adds `license_last_server_time` as persistent UCI state.
- `license-gate.sh`
  - reads/passes `license_last_server_time`.
  - sends `clientLastServerTime` in shell fallback online validation.
  - stores successful dashboard `serverTime`.
  - passes `--client-last-server-time` to the native Rust gate.
- `universal-core/src/bin/v2rayez-license-gate.rs`
  - adds `--client-last-server-time`.
  - sends it to dashboard validation when present.
  - feeds it into `offline_start_decision` for grace rollback detection.
  - emits/stores `serverTime` only for allowed trusted decisions, preserving the previous trusted value on denial.

### Static gate

- `tools/runtime_license_watchdog_gate.mjs`
  - now asserts dashboard server-time rollback handling and cross-platform client propagation/storage across desktop, Android, iOS app, iOS extension, OpenWrt shell, and OpenWrt native gate.

## Validation Run

```bash
bash -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node --check tools/license_serial_e2e_selftest.mjs
node tools/license_serial_e2e_selftest.mjs
node --check tools/openwrt_packaging_gate.mjs
node tools/openwrt_packaging_gate.mjs
MICAFP/scripts/package-openwrt.sh --check
npm run lint --prefix MICAFP/dashboard
npm run build --prefix MICAFP/dashboard
node tools/v2rayez_identity_gate.mjs
node tools/release_artifact_contract_gate.mjs
git diff --check
```

Result: PASS.

## Local Blockers

- Native Rust compile validation remains blocked because `cargo`/`rustc` are not installed in this sandbox.
- Android/iOS compile validation remains blocked because Gradle/JDK/Xcode are not installed in this sandbox.
- OpenWrt target SDK artifact generation remains blocked without a real target SDK.

## Scope Note

This milestone improves source-level and dashboard-build validation for serial anti-rollback behavior. It still does not replace real deployed API/database validation, router/device testing, or real connectivity testing.
