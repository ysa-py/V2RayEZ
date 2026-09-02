# Milestone 56 — Android Smart Diagnostics Auto-Repair

## Scope
- Add an automatic, auditable repair path to the existing V2RayEZ Diagnostics screen without redesigning the UI.
- Repair only safe local settings; do not delete servers, subscriptions, keys, addon packs, or capabilities.
- Rerun diagnostics automatically after applying a repair plan and reconnect the active tunnel when a repaired setting requires a rebuilt TUN/proxy runtime.

## Changes
- `app/src/main/java/com/v2rayez/app/data/diagnostics/SmartRepairPlanner.kt`
  - New deterministic smart-repair planner with stable action IDs.
  - Repairs LocalDNS/sniffing mismatch, invalid local proxy ports, invalid MTU, split LAN/hotspot flags, blank/malformed DNS values, missing/legacy local AI fallback, Tor + domain-fronting connect-time conflict, and app lockdown request alignment.
  - Preserves all user data and returns every automatic change as an auditable action.
- `app/src/main/java/com/v2rayez/app/ui/viewmodel/DiagnosticsViewModel.kt`
  - Added `DiagnosticsRepairState` and `autoRepair()`.
  - Applies the repair plan to settings, reconnects the current server when required, and reruns diagnostics automatically.
- `app/src/main/java/com/v2rayez/app/ui/screens/tools/ToolScreens.kt`
  - Added a **Smart repair** button using the existing V2RayEZ `PrimaryButton` style.
  - Shows a compact repair summary card and includes repair results in copied diagnostics reports.
- EN/FA/RU strings were added for the Smart repair action and summary.
- `tools/android_smart_repair_gate.mjs`
  - New static gate ensuring smart repair preserves user data, keeps V2RayEZ local AI fallback, repairs core settings, reconnects when required, and is wired into Diagnostics UI.

## Validation
- `node tools/android_smart_repair_gate.mjs` — passed.
- `bash 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh'` — passed.
- Android string XML parse for EN/FA/RU — passed.
- `node tools/runtime_license_watchdog_gate.mjs` — passed.
- `node tools/v2rayez_identity_gate.mjs` — passed.
- `node tools/release_artifact_contract_gate.mjs` — passed.
- `scripts/build-release-artifacts.sh --check` — passed.
- `git diff --check` — passed.

## Blocked Real Build/Test
- `bash ./gradlew testDebugUnitTest` in the core V2RayEZ app folder was attempted after the changes, but the sandbox has no Java runtime:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Device-level real connectivity and automatic repair validation still require a real Android device/emulator, JDK, Android SDK, and reachable test network.
