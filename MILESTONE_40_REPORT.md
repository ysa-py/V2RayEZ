# Milestone 40 Report — Mobile License Server-Time Observability

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Expose the last trusted license server time in mobile settings so users and testers can verify anti-rollback state without inspecting private storage, while preserving fail-closed license enforcement.

## Changes Applied

### Android

- Extended `LicenseValidationResult` with `serverTime`.
- Server validations now return and persist trusted `serverTime` into `LicenseConfig.lastServerTime`.
- Offline grace decisions surface their signed grace-token `serverTime`.
- VPN/MITM/runtime watchdog persistence keeps the previous trusted server time when a decision has no new trusted `serverTime`.
- License settings UI now displays `Last trusted server time` when present.
- Added EN/FA/RU string resources for the new status line while preserving string-key parity.

### iOS

- `SettingsView.swift` now binds `licenseLastServerTime` from the shared app group defaults.
- The License section displays the last trusted server time when present.
- This matches the shared storage written by `LicenseManager` and the Network Extension gate.

### Static gate

- `tools/runtime_license_watchdog_gate.mjs` now asserts the Android/iOS status surfaces for last trusted server time in addition to cross-platform propagation.

## Validation Run

```bash
bash 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh'
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node tools/v2rayez_identity_gate.mjs
npm test --prefix V2RayEZ-GUI
npm run lint --prefix MICAFP/dashboard
npm run build --prefix MICAFP/dashboard
git diff --check
```

Result: PASS.

## Local Blockers

- Android compile/device validation remains blocked locally because Gradle/JDK are unavailable.
- iOS compile/device validation remains blocked locally because Xcode is unavailable.
