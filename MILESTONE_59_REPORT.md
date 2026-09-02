# Milestone 59 — Android Emergency Privacy Cleanup

## Scope
- Add a defensive local trace-cleanup control for the Android V2RayEZ app, preserving the V2RayEZ UI/UX.
- Implement only device-owner local cleanup. Do not claim guaranteed anonymity or deletion of server-side records.

## Changes
- `app/src/main/java/com/v2rayez/app/domain/repository/Repositories.kt`
  - Added `EmergencyPrivacyCleanup` and `PrivacyCleanupResult` contracts.
- `app/src/main/java/com/v2rayez/app/data/privacy/AndroidEmergencyPrivacyCleanup.kt`
  - New Hilt-backed implementation that stops the active VPN tunnel and clears V2RayEZ-local traces:
    - in-memory logs,
    - session history,
    - daily traffic history,
    - local serial/license + signed grace/device binding data,
    - exported log cache,
    - bug-report cache,
    - WebView cache children.
  - Deliberately does not delete app databases/configuration wholesale and does not contact third-party systems.
- `app/src/main/java/com/v2rayez/app/data/local/Daos.kt`
  - Added explicit delete-all queries for session and daily-traffic tables.
- `app/src/main/java/com/v2rayez/app/di/DataModule.kt`
  - Bound `AndroidEmergencyPrivacyCleanup` to the domain contract.
- `app/src/main/java/com/v2rayez/app/ui/viewmodel/ViewModels.kt`
  - Wired Logs ViewModel to run the cleanup and return a status token for UI feedback.
- `app/src/main/java/com/v2rayez/app/ui/screens/logs/LogsScreen.kt`
  - Added a V2RayEZ-styled Logs-screen "Emergency privacy" button with explicit confirmation dialog.
  - The warning says this is local-only and not an anonymity guarantee.
- `app/src/main/res/values*/strings.xml`
  - Added EN/FA/RU strings while preserving localization key parity.
- `docs/ANDROID_EMERGENCY_PRIVACY_CLEANUP.md`
  - Documented scope, non-goals, and validation gates.
- `tools/android_emergency_privacy_gate.mjs`
  - New static gate ensuring the feature stops the VPN, clears local logs/traffic/license caches, is wired into DI/UI, keeps localization coverage, and does not make false anonymity/server-side deletion claims.

## Validation
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
- `bash ./gradlew :app:compileDebugKotlin` was attempted and remains blocked because the sandbox has no Java runtime:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Real Android UI/device confirmation still requires a JDK/Android SDK runner or a physical/emulated device.
