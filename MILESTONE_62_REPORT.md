# Milestone 62 — Per-Device License Revocation

## Scope
- Continue the license-management work by adding per-device revocation, not just whole-license revocation.
- Support the user's requirement for immediate cutoff where validation connectivity exists, while preserving the already documented offline limitation.
- Keep signing keys server-side and the separate Android admin app as an API client only.

## Changes
- `MICAFP/dashboard/src/lib/license-service.ts`
  - Added `revokeDeviceActivation()`.
  - Accepts either `activationId` or `licenseId + deviceIdHash`.
  - Sets `DeviceActivation.revokedAt` and stores a metadata revoke reason.
  - Existing validation path already returns `device_revoked` when a revoked activation validates.
- `MICAFP/dashboard/src/app/api/licenses/devices/revoke/route.ts`
  - New admin/operator endpoint: `POST /api/licenses/devices/revoke`.
  - Uses existing admin/session auth.
  - Writes `AuditLog` action `license.device.revoke`.
- `license-admin/src/main/java/com/v2rayez/licenseadmin/MainActivity.java`
  - Added Activation ID and Device hash fields.
  - Added `Revoke device now` action against the new endpoint.
  - Preserved no embedded signing keys and session-only admin token handling.
  - Fixed response-body reading to handle null error streams safely.
- `docs/LICENSE_API.md`
  - Documented the new per-device revoke endpoint, request/response shapes, audit behavior, and online cutoff semantics.
- `tools/license_device_revoke_gate.mjs`
  - New static gate verifying dashboard service/route/docs/admin-app wiring and no private signing key in the Android companion app.
- `tools/android_license_admin_gate.mjs`
  - Updated to include per-device revoke coverage and null-safe body reading.

## Validation
- `node tools/license_device_revoke_gate.mjs` — passed.
- `node tools/android_license_admin_gate.mjs` — passed.
- `node tools/android_license_revocation_poll_gate.mjs` — passed.
- `node tools/runtime_license_watchdog_gate.mjs` — passed.
- `node tools/release_artifact_contract_gate.mjs` — passed.
- `scripts/build-release-artifacts.sh --check` — passed.
- `npm run lint --prefix MICAFP/dashboard` — passed.
- `npm run build --prefix MICAFP/dashboard` — passed; Next.js route manifest includes `/api/licenses/devices/revoke`.
- License Admin XML parse for manifest/styles — passed.
- `git diff --check` — passed.

## Blocked Real Build/Test
- `bash ./gradlew :license-admin:assembleDebug` was attempted and remains blocked because the sandbox has no Java runtime:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Real per-device revoke timing needs a deployed dashboard/database, a validated device activation, the Android admin APK, and a VPN client with a reachable validation URL.
