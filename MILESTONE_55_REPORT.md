# Milestone 55 — Android No-Code Signed License Verification Controls

## Scope
- Continue work inside the base V2RayEZ core application folder while preserving the existing V2RayEZ UI/UX.
- Add no-code Android controls for signed-license public keys and device-hash salt so deployments can rotate license verification settings without rebuilding the APK.
- Keep signed serial, device binding, offline grace, and server-time rollback behavior fail-closed.

## Changes
- `app/src/main/java/com/v2rayez/app/domain/model/ConfigModels.kt`
  - Added `LicenseConfig.publicKeyPem`, `LicenseConfig.publicKeysJson`, and `LicenseConfig.deviceHashSalt`.
- `app/src/main/java/com/v2rayez/app/data/license/AndroidLicenseRepository.kt`
  - Local Ed25519 verification now overlays runtime-configured public key PEM / key-set JSON on top of build-time defaults.
  - Device-bound offline grace verification now uses the runtime `deviceHashSalt` first, then the build-time salt, then the canonical V2RayEZ default.
  - Added `clearGrace()` and clears stale grace before storing a newly activated serial.
- `app/src/main/java/com/v2rayez/app/ui/screens/settings/LicenseScreen.kt`
  - Added V2RayEZ-styled fields for License public key PEM, License key set JSON, and Device hash salt inside the existing Serial activation card.
  - Activate/Save persists these no-code verification settings.
- `app/src/main/java/com/v2rayez/app/ui/viewmodel/LicenseAiViewModels.kt`
  - Clears stale offline grace when account, validation URL, public key PEM, key-set JSON, or device salt changes.
  - Persists the latest `serverTime` from manual activation/validation into `LicenseConfig.lastServerTime` so the status card reflects the trusted anti-rollback time.
  - Clearing the serial also clears visible expiry/grace/server-time status.
- Strings were added with EN/FA/RU parity for the new license controls.
- `tools/runtime_license_watchdog_gate.mjs` now asserts the Android no-code public-key/salt wiring and stale-grace clearing behavior.

## Validation
- `bash 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh'` — passed.
- Android string XML parse for EN/FA/RU — passed.
- `node tools/runtime_license_watchdog_gate.mjs` — passed.
- `node tools/v2rayez_identity_gate.mjs` — passed.
- `node tools/release_artifact_contract_gate.mjs` — passed.
- `scripts/build-release-artifacts.sh --check` — passed.
- `git diff --check` — passed.

## Blocked Real Build/Test
- `bash ./gradlew testDebugUnitTest` in the core V2RayEZ app folder was attempted, but the sandbox has no Java runtime:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Real Android unit/instrumented tests and APK generation still require a JDK/Android SDK runner.
