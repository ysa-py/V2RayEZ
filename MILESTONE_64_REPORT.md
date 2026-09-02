# Milestone 64 — Android Carrier Core Profiles

## Scope
- Continue the V2RayEZ Universal merge by preserving the MICAFP named-core inventory and the UAC-Windows per-carrier preference system.
- Add Android Auto mode for the five specified Iranian carriers without changing V2RayEZ UI/UX or importing donor UI.
- Keep detection privacy-preserving: no phone/subscriber/hardware identifiers and no new dangerous permissions.

## Changes
- `app/src/main/java/com/v2rayez/app/data/core/AndroidCarrierCoreSelector.kt`
  - Added `IranianCarrierProfile` detection for MCI/Hamrah-Aval, IranCell, Shatel, Asiatek, and Rightel.
  - Added exact `NamedVpnCoreProfile` inventory for the 9 MICAFP cores:
    1. hiddify-core v4.1.0
    2. GFW-knocker/Xray-core v25.8.3-mahsa-r1
    3. sing-box v1.14.0-alpha.25
    4. AmneziaVPN (awg-go) 4.8.15.4
    5. DefyxVPN v5.2.8
    6. MoaV v1.7.7
    7. Lantern v7.9.0
    8. MahsaNG core v26.3.31-mahsa-r1
    9. Psiphon (GFW-knocker fork)
  - Added the required carrier preference rules:
    - MCI/Hamrah-Aval → MahsaNG + AmneziaVPN
    - IranCell → hiddify-core + DefyxVPN
    - Shatel → AmneziaVPN + Psiphon
    - Asiatek → MahsaNG + hiddify-core
    - Rightel → DefyxVPN + hiddify-core
  - Detects only coarse `TelephonyManager` operator display/numeric values; no `READ_PHONE_STATE`, subscriber id, phone number, IMEI/MEID, IMSI, ICCID, SSID/BSSID, or local IP collection.
- `AppSettings`
  - Added `carrierCoreAutoEnabled` so Auto mode is persisted and can be toggled without overwriting per-server core choices.
- `V2RayVpnService`
  - Wires the selector into the real connect path.
  - Applies carrier-selected runtime families only when the server follows `App default`.
  - Respects explicit per-server core pins.
  - Preserves Xray wiring for Tor/domain-fronting cases.
  - Leaves the existing fail-safe fallback to bundled Xray when a selected process core is unavailable.
- `CoreManagerViewModel` and `CoreManagerScreen`
  - Added V2RayEZ-styled Core Manager section showing Auto/Manual carrier mode, detected carrier, recommended order, and the exact named core inventory.
- `docs/ANDROID_CARRIER_CORE_PROFILES.md`
  - Documents inventory, carrier rules, runtime behavior, privacy constraints, and remaining runtime proof.
- `docs/V2RAYEZ_UNIVERSAL_REQUIREMENT_MAP.md`
  - Updated the relevant named-core and carrier-profile rows to reflect Android M64 progress.
- `tools/android_carrier_core_profiles_gate.mjs`
  - New static gate for the 5 carriers, 9 named cores, service integration, UI/settings wiring, docs, strings, and no `READ_PHONE_STATE` permission.

## Validation Passed
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
- Android EN/FA/RU string-key parity: 1046 keys in each locale.
- `npm run build --prefix MICAFP/dashboard`
- `git diff --check`

## Blocked Real Build/Test
- `bash ./gradlew :app:compileDebugKotlin :license-admin:assembleDebug` was attempted and remains blocked because the sandbox has no Java runtime:
  - `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
- Real carrier Auto selection still needs validation on real Iranian carrier SIM/eSIM/network profiles and with actual downloaded named core binaries. This sandbox has neither Android devices nor the native build/runtime toolchains.
