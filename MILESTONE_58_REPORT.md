# Milestone 58 — Android National Intranet / Shutdown Diagnostics

## Scope
- Add an Android V2RayEZ diagnostics section for international-internet outage / national-intranet conditions.
- Address the user's "without server if possible" requirement honestly: detect domestic-only conditions and surface serverless/mesh limits without pretending a phone can create international egress with no reachable peer, relay, server, or gateway.
- Preserve the V2RayEZ UI/UX and base app identity.

## Changes
- `app/src/main/java/com/v2rayez/app/data/intranet/NationalIntranetDetector.kt`
  - New injectable local detector with domestic and international HTTPS probe groups.
  - Classifies local reachability as `NORMAL`, `PARTIAL_RESTRICTION`, `DOMESTIC_ONLY`, or `OFFLINE`.
  - Keeps probe results local; this class does not upload telemetry.
- `app/src/main/java/com/v2rayez/app/ui/viewmodel/DiagnosticsViewModel.kt`
  - Added the `Shutdown / intranet` diagnostics section.
  - Added rows for national-intranet state, domestic reachability, international reachability, and no-server/mesh limits.
  - Shows honest fallback advice for partial restriction, domestic-only, and full-offline states.
- `app/src/main/java/com/v2rayez/app/ui/screens/tools/ToolScreens.kt`
  - Mapped the new diagnostic section and rows to localized V2RayEZ UI strings.
- `app/src/main/res/values*/strings.xml`
  - Added EN/FA/RU string keys for the new section and rows while preserving full string-key parity.
- `docs/ANDROID_NATIONAL_INTRANET_DIAGNOSTICS.md`
  - Documented the exact states, operational behavior, privacy note, and no-server limitation.
- `tools/android_national_intranet_gate.mjs`
  - New static gate asserting detector states, diagnostics wiring, UI mapping, localization, and no false serverless-global-internet claims.

## Validation
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
- Native Android compilation/device validation remains blocked in this sandbox because Java/JDK is unavailable:
  - `JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Real probe behavior must still be validated on Android devices/networks with normal, partial, domestic-only, and offline connectivity profiles.
