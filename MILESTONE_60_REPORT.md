# Milestone 60 — Android Online Revocation Poll Control

## Scope
- Tighten the Android VPN hard-cutoff path for the user's requirement that revoked/deleted licenses cut off active VPN clients as fast as honestly possible.
- Preserve the technical limit: fully offline clients cannot receive an instant revoke without a reachable validation channel.

## Changes
- `app/src/main/java/com/v2rayez/app/domain/model/ConfigModels.kt`
  - Added `LicenseConfig.revocationPollSeconds` with default `10` seconds.
  - Documented that this is the fastest honest online revoke path and that offline clients still depend on next validation/grace/expiry cutoff.
- `app/src/main/java/com/v2rayez/app/data/service/V2RayVpnService.kt`
  - Active tunnel license watchdog now uses `revocationPollSeconds` whenever a validation URL is configured.
  - Poll interval is clamped to 5–300 seconds.
  - License expiry/grace hard-cutoff still wins if it happens earlier than the next online revoke poll.
- `app/src/main/java/com/v2rayez/app/ui/viewmodel/LicenseAiViewModels.kt`
  - Activation flow persists the no-code poll interval with the rest of the license configuration.
- `app/src/main/java/com/v2rayez/app/ui/screens/settings/LicenseScreen.kt`
  - Added a V2RayEZ-styled numeric field for online revoke poll seconds.
- `app/src/main/res/values*/strings.xml`
  - Added EN/FA/RU localization for the new field while preserving parity.
- `docs/LICENSE_API.md`
  - Documented the Android `revocationPollSeconds` operational behavior.
- `tools/android_license_revocation_poll_gate.mjs`
  - New static gate asserting settings model, active VPN watchdog use, UI no-code control, docs, localization, and offline limitation text.
- `tools/runtime_license_watchdog_gate.mjs`
  - Updated to enforce the smarter poll-based Android watchdog instead of the older fixed one-minute assertion.

## Validation
- `node tools/android_license_revocation_poll_gate.mjs` — passed.
- `node tools/android_emergency_privacy_gate.mjs` — passed.
- `node tools/android_national_intranet_gate.mjs` — passed.
- `node tools/android_license_admin_gate.mjs` — passed.
- `node tools/release_artifact_contract_gate.mjs` — passed.
- `scripts/build-release-artifacts.sh --check` — passed.
- `node tools/android_smart_repair_gate.mjs` — passed.
- `node tools/runtime_license_watchdog_gate.mjs` — passed.
- `node tools/v2rayez_identity_gate.mjs` — passed.
- Android XML parse for EN/FA/RU strings and License Admin manifest/styles — passed.
- Base Android EN/FA/RU string-key parity gate — passed.
- `git diff --check` — passed.

## Blocked Real Build/Test
- `bash ./gradlew :app:compileDebugKotlin` was attempted and remains blocked because Java is unavailable in this sandbox:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Real revoke timing tests need a built Android APK, a deployed dashboard, a license token, and a client/device with reachable validation URL.
