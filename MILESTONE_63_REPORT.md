# Milestone 63 — Serverless-First Offline License Manager and Requirement Map

## Scope
- Accept the repeated V2RayEZ Universal directive as the active engineering contract.
- Add the missing offline-first Android License Manager behavior from §3.1–§3.3 instead of only relying on the dashboard license issuer.
- Add local VPN-client enforcement for optional device binding and signed revocation-list tokens.
- Produce an explicit requirement/source map so remaining donor features are tracked instead of silently omitted.

## Changes
- `docs/V2RAYEZ_UNIVERSAL_REQUIREMENT_MAP.md`
  - Added a live map across all 8 donor/source projects, target homes, status, platform artifact state, and explicit gaps.
  - Explicitly marks remaining work as `SOURCE-PRESENT`, `PARTIAL`, `BLOCKED-LOCAL`, or `IMPOSSIBLE-AS-STATED` instead of calling it done.
- `MERGE_INVENTORY.json`
  - Regenerated from `tools/merge_inventory.py` after the latest milestone files/modules were added.
- `license-admin/src/main/java/com/v2rayez/licenseadmin/OfflineLicenseManager.java`
  - New real offline License Manager implementation inside the separate operator/admin Android app.
  - Generates an Ed25519 signing seed locally and encrypts it with Android Keystore AES-GCM.
  - Issues dashboard-compatible signed `V2RayEZ-License` compact tokens using stable JSON signing input.
  - Maintains independent per-license ledger records: owner label, user/account, issue/expiry, optional device hash, features, status, and revocation epoch.
  - Renews one license by editing only that record's expiry and re-signing it.
  - Revokes one license by marking only that record revoked, incrementing `revocationEpoch`, and exporting a signed `V2RayEZ-Revocation-List` token.
  - Exports/imports the ledger as `v2rayez-license-ledger.enc` with PBKDF2-HMAC-SHA256 + AES-256-GCM.
- `license-admin/build.gradle.kts`
  - Added BouncyCastle bcprov dependency for pure Java Ed25519 signing in the manager app.
- `license-admin/src/main/java/com/v2rayez/licenseadmin/MainActivity.java`
  - Re-labeled the separate app as `V2RayEZ License Manager / Admin`.
  - Added offline issue, renew, revoke, public-key, ledger-summary, encrypted ledger export/import, and signed revocation-list export actions.
  - Kept dashboard issue/renew/revoke/validate/per-device-revoke actions available as a separate online admin mode.
- `AndroidLicenseRepository.kt`
  - Added local optional `deviceIdHash` enforcement for signed serials.
  - Added local signed revocation-list verification (`V2RayEZ-Revocation-List`) and hard denial for matching `licenseId`/epoch.
  - Added display helper for the full device-binding hash needed by offline device-bound serials.
- `LicenseConfig`, `LicenseViewModel`, `LicenseScreen`, and EN/FA/RU strings
  - Added no-code field for a signed revocation-list token.
  - License status now shows device binding as device preview plus full hash.
- `docs/SERVERLESS_LICENSE_MANAGER.md` and `docs/LICENSE_API.md`
  - Documented offline License Manager operations, token semantics, encrypted ledger, client enforcement, and the honest serverless propagation limitation.
- Gates updated/added:
  - `tools/offline_license_manager_gate.mjs`
  - `tools/requirement_map_gate.mjs`
  - Updated `android_license_admin_gate` and `license_device_revoke_gate` for the new dual-mode manager/admin UI labels.

## Validation Passed
- `node tools/requirement_map_gate.mjs`
- `node tools/offline_license_manager_gate.mjs`
- `node tools/license_device_revoke_gate.mjs`
- `node tools/android_license_admin_gate.mjs`
- `node tools/android_license_revocation_poll_gate.mjs`
- `node tools/runtime_license_watchdog_gate.mjs`
- `node tools/android_adaptive_route_memory_gate.mjs`
- `node tools/android_emergency_privacy_gate.mjs`
- `node tools/android_national_intranet_gate.mjs`
- `node tools/release_artifact_contract_gate.mjs`
- `scripts/build-release-artifacts.sh --check`
- `node tools/android_smart_repair_gate.mjs`
- `node tools/v2rayez_identity_gate.mjs`
- Android XML parse for EN/FA/RU strings and License Admin manifest/styles.
- Android EN/FA/RU string-key parity: 1039 keys in each locale.
- `npm run lint --prefix MICAFP/dashboard`
- `npm run build --prefix MICAFP/dashboard`
- `git diff --check`

## Build Attempts / Local Blockers
- `bash ./gradlew :app:compileDebugKotlin :license-admin:assembleDebug` failed because the sandbox has no Java runtime:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Release artifact targets were attempted and fail-closed because required native toolchains are unavailable here:
  - Android: missing `java`.
  - iOS: missing `xcodegen`/`xcodebuild`.
  - Windows: missing `cargo` and Windows builder/runtime.
  - Linux: missing `cargo`.
  - OpenWrt: `OPENWRT_SDK` not configured.

## Honest Limitation
- The new serverless revocation-list token is real and locally enforced once received, but a fully isolated/offline target device still cannot receive an immediate revoke signal. Revocation propagates only through a reachable channel (dashboard validation, mesh/IPFS/DNS/covert channel once implemented, or manual signed token import).
- Full shared Rust-core native enforcement and real cross-platform connectivity tests remain mandatory future work; they were not proven in this sandbox.
