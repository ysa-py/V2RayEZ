# Milestone 65 — Android Route Matrix Speed Test

## Scope
- Continue the V2RayEZ Universal merge by implementing the UAC-Android Route Speed Test concept in the V2RayEZ Android app.
- Preserve the V2RayEZ UI/UX: no donor UI, no mascot/wizard UI, and no imported donor screen layout.
- Add a real staged matrix tester for Edge × DNS × Fragment × MTU using the same settings model and test paths used by V2RayEZ's connect/probe code.

## Changes
- `app/src/main/java/com/v2rayez/app/ui/viewmodel/RouteSpeedTestViewModel.kt`
  - New Hilt ViewModel for the route matrix race.
  - Builds a bounded mobile-safe but exhaustive matrix over selected edges:
    - Edge: up to 4 configured compatible endpoints, sorted favorites first, then known ping, then name.
    - DNS: Cloudflare+AliDNS, Quad9+AliDNS, AdGuard+AliDNS, AliDNS-only, guarded FakeDNS.
    - Fragment: Off, Fast 64–128B, Balanced 100–200B, Stealth 256–512B.
    - MTU: 1280, 1360, 1420, 1500.
  - Runs the UAC-style staged competition:
    - qualification,
    - stability,
    - stress,
    - final A/B/B/A.
  - Scores candidates on latency, jitter, throughput sample, success rate, confidence, and sample count.
  - Applies candidate settings to the real V2RayEZ `AppSettings` (`DnsConfig`, `FragmentConfig`, `mtu`) for probe stages and restores the original settings after each candidate.
  - Winner can be applied to V2RayEZ settings explicitly.
- `ToolScreens.kt`, `ToolsScreen.kt`, `Routes.kt`, `V2RayApp.kt`
  - Added V2RayEZ-styled Route Matrix Test screen under Tools.
  - Added navigation route `route_speed_test`.
  - Added result cards, current winner card, phase/progress display, and apply-winner action using existing V2RayEZ components.
- `strings.xml`, `values-fa/strings.xml`, `values-ru/strings.xml`
  - Added EN/FA/RU strings for the new screen and maintained parity.
- `docs/ANDROID_ROUTE_MATRIX_SPEED_TEST.md`
  - Documents matrix dimensions, staged competition, scoring, UI/UX constraints, and remaining real-lab validation requirements.
- `docs/V2RAYEZ_UNIVERSAL_REQUIREMENT_MAP.md`
  - Updated the UAC Route Speed Test requirement row to reflect Android M65 progress.
- `tools/android_route_matrix_speed_test_gate.mjs`
  - New static gate asserting matrix dimensions, stages, A/B/B/A final, throughput/site-fetch probes, settings restore/apply, UI/navigation/string/docs coverage, and absence of placeholder markers.
- `MERGE_INVENTORY.json`
  - Regenerated after the new M65 files were added.

## Validation Passed
- `node tools/android_route_matrix_speed_test_gate.mjs`
- `node tools/android_carrier_core_profiles_gate.mjs`
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
- Android XML parse for EN/FA/RU strings plus manifests/styles.
- Android EN/FA/RU string-key parity: 1063 keys in each locale.
- `npm run build --prefix MICAFP/dashboard`
- `git diff --check`

## Blocked Real Build/Test
- `bash ./gradlew :app:compileDebugKotlin :license-admin:assembleDebug` was attempted and remains blocked because the sandbox has no Java runtime:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Real Route Matrix Test validation still needs an Android device/lab, real configured servers, and carrier/network diversity to prove the winner actually improves traffic under censorship conditions.
