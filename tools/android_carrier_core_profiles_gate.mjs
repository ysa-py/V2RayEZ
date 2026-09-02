#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }
function lacks(path, needle) { assert.ok(!text(path).includes(needle), `${path} must not contain ${needle}`); }

const base = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';
const selector = `${base}/app/src/main/java/com/v2rayez/app/data/core/AndroidCarrierCoreSelector.kt`;
const model = `${base}/app/src/main/java/com/v2rayez/app/domain/model/ConfigModels.kt`;
const service = `${base}/app/src/main/java/com/v2rayez/app/data/service/V2RayVpnService.kt`;
const vm = `${base}/app/src/main/java/com/v2rayez/app/ui/viewmodel/CoreManagerViewModel.kt`;
const screen = `${base}/app/src/main/java/com/v2rayez/app/ui/screens/settings/CoreManagerScreen.kt`;
const docs = ['docs/ANDROID_CARRIER_CORE_PROFILES.md', 'docs/V2RAYEZ_UNIVERSAL_REQUIREMENT_MAP.md'];
const androidManifest = `${base}/app/src/main/AndroidManifest.xml`;
const strings = [
  `${base}/app/src/main/res/values/strings.xml`,
  `${base}/app/src/main/res/values-fa/strings.xml`,
  `${base}/app/src/main/res/values-ru/strings.xml`,
];

for (const needle of [
  'enum class IranianCarrierProfile',
  'MCI(',
  'IRANCELL(',
  'SHATEL(',
  'ASIATEK(',
  'RIGHTEL(',
  'data class NamedVpnCoreProfile',
  'object V2RayEzNamedCoreInventory',
  'hiddify-core',
  'GFW-knocker/Xray-core',
  'v25.8.3-mahsa-r1',
  'sing-box',
  'v1.14.0-alpha.25',
  'AmneziaVPN (awg-go)',
  'DefyxVPN',
  'MoaV',
  'Lantern',
  'MahsaNG core',
  'Psiphon (GFW-knocker fork)',
  'IranianCarrierProfile.MCI to listOf("mahsang", "amnezia-awg")',
  'IranianCarrierProfile.IRANCELL to listOf("hiddify-core", "defyxvpn")',
  'IranianCarrierProfile.SHATEL to listOf("amnezia-awg", "psiphon-gfw-knocker")',
  'IranianCarrierProfile.ASIATEK to listOf("mahsang", "hiddify-core")',
  'IranianCarrierProfile.RIGHTEL to listOf("defyxvpn", "hiddify-core")',
  'TelephonyManager',
  'networkOperatorName',
  'simOperatorName',
  'networkOperator',
  'simOperator',
  'does not request READ_PHONE_STATE',
  'server.preferredCore != CorePreference.SYSTEM',
  'settings.tor.enabled || settings.domainFront.enabled',
]) has(selector, needle);

for (const forbidden of [
  'getSubscriberId',
  'getDeviceId',
  'getImei',
  'getMeid',
  'getLine1Number',
  'WifiInfo',
  'getBSSID',
  'getSSID',
]) lacks(selector, forbidden);

has(model, 'val carrierCoreAutoEnabled: Boolean = true');
has(service, '@Inject lateinit var carrierCoreSelector: AndroidCarrierCoreSelector');
has(service, 'carrierCoreSelector.chooseCore(server, settings, coreType)');
has(service, 'Carrier profile ${carrierDecision.reason} selected');
has(vm, 'setCarrierCoreAuto(enabled: Boolean)');
has(vm, 'detectedCarrierLabel()');
has(vm, 'carrierPreferenceSummary()');
has(vm, 'namedCoreInventoryLines()');
has(screen, 'core_carrier_profile_title');
has(screen, 'state.carrierCoreAutoEnabled');
has(screen, 'viewModel.setCarrierCoreAuto(true)');
has(screen, 'viewModel.namedCoreInventoryLines().forEach');
for (const path of strings) {
  has(path, 'core_carrier_profile_title');
  has(path, 'core_named_inventory_title');
}
lacks(androidManifest, 'android.permission.READ_PHONE_STATE');

for (const path of docs) {
  has(path, 'MCI');
  has(path, 'IranCell');
  has(path, 'Shatel');
  has(path, 'Asiatek');
  has(path, 'Rightel');
}

console.log('android_carrier_core_profiles_gate: PASS');
