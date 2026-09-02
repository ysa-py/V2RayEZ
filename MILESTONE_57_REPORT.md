# Milestone 57 — Separate Android License Admin Companion

## Scope
- Add the separate Android app the user requested for serial/license administration while keeping the VPN client as the V2RayEZ base app/UI.
- Coordinate the companion app with the existing dashboard license server; do not embed signing private keys or mint serials locally on the operator device.
- Support per-user issue/renew/revoke/validate operations and wire the additional APK into the fail-closed Android release contract.

## Changes
- `V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/settings.gradle.kts`
  - Added the new `:license-admin` Android application module.
- `.../license-admin/`
  - New separate Android package: `com.v2rayez.licenseadmin`.
  - Programmatic V2RayEZ-styled operator UI for dashboard base URL, session-only admin token, per-user account fields, independent expiry, max devices, offline-grace hours, feature flags, license ID, license key, and revoke reason.
  - Calls the dashboard REST endpoints:
    - `POST /api/licenses/issue`
    - `POST /api/licenses/renew`
    - `POST /api/licenses/revoke`
    - `POST /api/licenses/validate`
  - Requires HTTPS dashboard URLs for admin operations.
  - Keeps the admin bearer/session token in memory only; it is not saved in SharedPreferences.
  - Explicitly does not contain Ed25519 private-key material or local signing logic; anti-forgery remains server-side.
- `scripts/build-release-artifacts.sh`
  - Android target now builds both `:app:assembleRelease` and `:license-admin:assembleRelease`.
  - Android artifact collection now copies both the VPN APK and the License Admin APK.
- `docs/LICENSE_API.md`
  - Documented the Android License Admin companion app, its API behavior, and exact revocation cutoff semantics.
  - Explicitly notes that offline clients cannot receive an instant revoke packet without a reachable validation channel; they stop at next validation or signed grace/expiry hard cutoff.
- `tools/android_license_admin_gate.mjs`
  - New static gate for module registration, manifest security, admin API coverage, no private-key/local-signing logic, no admin-token persistence, docs, and release artifact wiring.
- `tools/release_artifact_contract_gate.mjs`
  - Updated Android release contract assertions to require the License Admin APK build/copy path.

## Validation
- `node tools/android_license_admin_gate.mjs` — passed.
- `node tools/release_artifact_contract_gate.mjs` — passed.
- `scripts/build-release-artifacts.sh --check` — passed.
- `node tools/android_smart_repair_gate.mjs` — passed.
- `node tools/runtime_license_watchdog_gate.mjs` — passed.
- `node tools/v2rayez_identity_gate.mjs` — passed.
- License Admin XML parse for manifest/styles — passed.
- Base Android EN/FA/RU string-key parity gate — passed.
- `git diff --check` — passed.

## Blocked Real Build/Test
- `bash ./gradlew :license-admin:assembleDebug` was attempted but the sandbox has no Java runtime:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- `scripts/build-release-artifacts.sh --target android` was attempted and failed closed as intended because `java` is missing:
  - `error: required tool 'java' is not installed for target 'android'`
- Real APK generation, admin-login/API smoke tests, revoke-to-active-client cutoff timing, and device install tests still require a JDK/Android SDK runner plus a deployed dashboard.
