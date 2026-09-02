# Milestone 61 — Android Adaptive Route Memory

## Scope
- Continue the donor-feature merge by adding UAC-style adaptive connection memory to the Android V2RayEZ Home power button.
- Preserve the V2RayEZ UI/UX: no donor UI is introduced.
- Keep the network fingerprint privacy-preserving and local-only.

## Changes
- `app/src/main/java/com/v2rayez/app/data/routing/AndroidAdaptiveRouteMemory.kt`
  - New `AdaptiveRouteMemory` contract plus Android implementation.
  - Maintains a local per-network-class score table.
  - Records successful routes with EWMA latency and protocol/core labels.
  - Records failed routes with bounded cooldown so repeated failures stop winning Auto Connect.
  - Uses a coarse fingerprint: Wi-Fi/cellular/Ethernet/VPN/other + metered/not-roaming/validated capability.
  - Explicitly avoids phone numbers, subscriber IDs, IMEI/MEID, SSID/BSSID, local IPs, destination hosts, serial/license keys, and subscription contents.
- `app/src/main/java/com/v2rayez/app/ui/viewmodel/ViewModels.kt`
  - Home auto-connect now promotes the current network class's champion/backup routes before its quick TCP scoring pass.
  - Existing quick probes remain the final lightweight check before connect.
- `app/src/main/java/com/v2rayez/app/data/service/V2RayVpnService.kt`
  - Records successful connected sessions into adaptive memory.
  - Records tunnel/connect failures into adaptive memory before teardown so bad routes enter cooldown.
- `app/src/main/java/com/v2rayez/app/di/DataModule.kt`
  - Binds `AndroidAdaptiveRouteMemory` as the app-wide `AdaptiveRouteMemory`.
- `docs/ANDROID_ADAPTIVE_ROUTE_MEMORY.md`
  - Documents behavior, privacy constraints, and validation.
- `tools/android_adaptive_route_memory_gate.mjs`
  - New static gate enforcing route-memory wiring, privacy constraints, Home auto-connect integration, and VPN success/failure recording.

## Validation
- `node tools/android_adaptive_route_memory_gate.mjs` — passed.
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
- `bash ./gradlew :app:compileDebugKotlin` was attempted and remains blocked because the sandbox has no Java runtime:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Real adaptive-route behavior still needs device validation across multiple Wi-Fi/cellular/network profiles with real tunnels and traffic probes.
