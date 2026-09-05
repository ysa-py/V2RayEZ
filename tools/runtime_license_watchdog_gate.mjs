#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) {
  return readFileSync(path, 'utf8');
}

function assertContains(path, needle) {
  assert.ok(text(path).includes(needle), `${path} missing ${needle}`);
}

function assertOrder(path, first, second) {
  const body = text(path);
  const a = body.indexOf(first);
  const b = body.indexOf(second);
  assert.notEqual(a, -1, `${path} missing ${first}`);
  assert.notEqual(b, -1, `${path} missing ${second}`);
  assert.ok(a < b, `${path}: expected ${first} before ${second}`);
}


const licenseService = 'MICAFP/dashboard/src/lib/license-service.ts';
assertContains(licenseService, 'clientLastServerTimeRaw');
assertContains(licenseService, 'invalid_client_last_server_time');
assertContains(licenseService, 'server_time_rollback_detected');

const desktopLicense = 'V2RayEZ-GUI/src-tauri/src/license.rs';
assertContains(desktopLicense, 'client_last_server_time: Option<&str>');
assertContains(desktopLicense, 'payload["clientLastServerTime"] = json!(last_seen.trim());');
assertContains(desktopLicense, 'state.last_seen_server_time = Some(server_time.to_string());');
assertContains(desktopLicense, '.last_seen_server_time');
assertContains(desktopLicense, 'DateTime::parse_from_rfc3339(value)');

const androidLicense = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/data/license/AndroidLicenseRepository.kt';
assertContains(androidLicense, 'payload.put("clientLastServerTime", it)');
assertContains(androidLicense, 'KEY_LAST_SERVER_TIME');
assertContains(androidLicense, 'server_time_rollback_detected');
assertContains(androidLicense, 'serverTime = serverTime');
assertContains(androidLicense, 'publicKeyFor(header.optString("kid", "default"), config)');
assertContains(androidLicense, 'mergePublicKeys(config.publicKeysJson, keys)');
assertContains(androidLicense, 'val configuredPem = config.publicKeyPem.trim()');
assertContains(androidLicense, 'config.deviceHashSalt.ifBlank { BuildConfig.LICENSE_DEVICE_HASH_SALT }');
assertContains(androidLicense, 'fun clearGrace()');


const androidLicenseScreen = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/ui/screens/settings/LicenseScreen.kt';
assertContains(androidLicenseScreen, 'lastServerTime = config.lastServerTime');
assertContains(androidLicenseScreen, 'license_server_time_format');
assertContains(androidLicenseScreen, 'config.publicKeyPem');
assertContains(androidLicenseScreen, 'R.string.license_public_key_pem');
assertContains(androidLicenseScreen, 'R.string.license_public_keys_json');
assertContains(androidLicenseScreen, 'R.string.license_device_hash_salt');
assertContains(androidLicenseScreen, 'R.string.license_public_key_help');

const androidConfigModel = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/domain/model/ConfigModels.kt';
assertContains(androidConfigModel, 'val publicKeyPem: String = ""');
assertContains(androidConfigModel, 'val publicKeysJson: String = ""');
assertContains(androidConfigModel, 'val deviceHashSalt: String = "v2rayez-client-device-binding-v1"');
assertContains(androidConfigModel, 'val lastServerTime: String = ""');


const androidLicenseViewModel = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/ui/viewmodel/LicenseAiViewModels.kt';
assertContains(androidLicenseViewModel, 'licenseRepository.clearGrace()');
assertContains(androidLicenseViewModel, 'previous.publicKeyPem != next.publicKeyPem');
assertContains(androidLicenseViewModel, 'previous.publicKeysJson != next.publicKeysJson');
assertContains(androidLicenseViewModel, 'previous.deviceHashSalt != next.deviceHashSalt');
assertContains(androidLicenseViewModel, 'lastServerTime = result.serverTime.ifBlank { it.license.lastServerTime }');

const iosLicense = 'MICAFP/ios/UnifiedShield/App/LicenseManager.swift';
assertContains(iosLicense, 'body["clientLastServerTime"] = lastServerTime');
assertContains(iosLicense, 'defaults.set(serverTime, forKey: "licenseLastServerTime")');
assertContains(iosLicense, 'server_time_rollback_detected');

const iosSettings = 'MICAFP/ios/UnifiedShield/App/SettingsView.swift';
assertContains(iosSettings, '@AppStorage("licenseLastServerTime"');
assertContains(iosSettings, 'Last trusted server time');

const iosExtensionLicense = 'MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionLicenseGate.swift';
assertContains(iosExtensionLicense, 'body["clientLastServerTime"] = lastServerTime');
assertContains(iosExtensionLicense, 'defaults.set(serverTime, forKey: "licenseLastServerTime")');
assertContains(iosExtensionLicense, 'graceServerDate.addingTimeInterval(300) < lastServerDate');


const extensionProtocol = 'MICAFP/extensions/shared/protocol.ts';
assertContains(extensionProtocol, 'licensePublicKeyPem?: string;');
assertContains(extensionProtocol, 'licenseDeviceHashSalt?: string;');
assertContains(extensionProtocol, 'licenseLastServerTime?: string;');
assertContains(extensionProtocol, 'licenseGraceServerTime?: string;');
assertContains(extensionProtocol, 'nativeMessagingHost?: string;');
assertContains(extensionProtocol, 'nativeMessagingHostFallbacks?: string[];');
assertContains(extensionProtocol, "nativeMessagingHost: 'com.v2rayez.native'");
assertContains(extensionProtocol, "nativeMessagingHostFallbacks: ['com.unifiedshield.native']");

for (const path of [
  'MICAFP/extensions/chrome/background/service-worker.ts',
  'MICAFP/extensions/firefox/background/background.ts',
]) {
  assertContains(path, 'clientLastServerTime: config.licenseLastServerTime || undefined');
  assertContains(path, 'config.licenseLastServerTime = serverTime;');
  assertContains(path, 'config.licenseGraceServerTime = String(gracePayload.serverTime || serverTime ||');
  assertContains(path, 'using_signed_grace');
  assertContains(path, 'isHardCachedDenial(cached)');
  assertContains(path, "return ['license_expired', 'server_time_rollback_detected'].includes(reason);");
  assertContains(path, 'verifyLicenseToken(serial, publicKeyPem)');
  assertContains(path, 'licenseVerificationError');
  assertContains(path, 'verifyGraceToken(graceToken, publicKeyPem)');
  assertContains(path, 'offline_grace_device_mismatch');
  assertContains(path, 'hashDeviceId(`browser-extension:${');
  assertContains(path, "license_public_key_missing");
  assertContains(path, 'server_time_rollback_detected');
  assertContains(path, "config.nativeMessagingHost || 'com.v2rayez.native'");
  assertContains(path, "config.nativeMessagingHostFallbacks ?? ['com.unifiedshield.native']");
  assertContains(path, 'syncNativeIntegration();');
  assertContains(path, `dohResolver.updateConfig(config);
        syncNativeIntegration();`);
  assert.ok(!text(path).includes("connectNative('com.unifiedshield.native')"), `${path}: active runtime must not hard-code legacy native host as primary`);
}

for (const path of [
  'MICAFP/extensions/chrome/options/options.html',
  'MICAFP/extensions/firefox/options/options.html',
]) {
  assertContains(path, 'id="licensePublicKeyPem"');
  assertContains(path, 'Required for signed offline grace verification');
  assertContains(path, 'id="licenseDeviceHashSalt"');
  assertContains(path, 'Must match the dashboard license device salt');
  assertContains(path, 'id="licenseLastServerTime"');
  assertContains(path, 'Last trusted server time');
  assertContains(path, 'id="nativeMessagingHost"');
  assertContains(path, 'Default V2RayEZ host is used first');
}

for (const path of [
  'MICAFP/extensions/chrome/options/options.ts',
  'MICAFP/extensions/firefox/options/options.ts',
]) {
  assertContains(path, 'licensePublicKeyPem: document.getElementById');
  assertContains(path, 'licenseDeviceHashSalt: document.getElementById');
  assertContains(path, 'licenseLastServerTime: document.getElementById');
  assertContains(path, 'nativeMessagingHost: document.getElementById');
  assertContains(path, "config.licenseLastServerTime || 'Not validated yet'");
  assertContains(path, "config.nativeMessagingHost ?? 'com.v2rayez.native'");
  assertContains(path, "nativeMessagingHostFallbacks: ['com.unifiedshield.native']");
  assertContains(path, 'delete secrets.licenseGraceToken');
  assertContains(path, 'previousConfig.licensePublicKeyPem');
  assertContains(path, 'previousConfig.licenseDeviceHashSalt');
}

const openwrtGate = 'MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh';
assertContains(openwrtGate, 'LAST_SERVER_TIME=$(uci_get license_last_server_time)');
assertContains(openwrtGate, '"clientLastServerTime":"%s"');
assertContains(openwrtGate, 'SERVER_TIME=$(printf');

const nativeGate = 'universal-core/src/bin/v2rayez-license-gate.rs';
assertContains(nativeGate, 'client_last_server_time: String');
assertContains(nativeGate, 'payload_value["clientLastServerTime"] = json!(args.client_last_server_time.trim());');
assertContains(nativeGate, 'parse_rfc3339_utc(&args.client_last_server_time)');
assertContains(nativeGate, 'server_time: value.get("serverTime")');

const desktop = 'V2RayEZ-GUI/src-tauri/src/lib.rs';
assertContains(desktop, 'let license_status = license::enforce(app.clone(), &settings).await?;');
assertContains(desktop, 'license_status.remaining_seconds');
assertContains(desktop, 'fn license_watchdog_delay(remaining_seconds: i64) -> std::time::Duration');
assertContains(desktop, 'remaining_seconds.min(60) as u64');
assertOrder(desktop, 'let mut wait = license_watchdog_delay(initial_remaining_seconds);', 'tokio::time::sleep(wait).await;');
assert.ok(!text(desktop).includes('std::time::Duration::from_secs(60)).await;'), `${desktop}: fixed-interval watchdog sleep found`);

const android = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/data/service/V2RayVpnService.kt';
assertContains(android, 'val decision = licenseRepository.enforce(settingsRepository.current().license)');
assertContains(android, 'decision.remainingSeconds <= 0 -> 1_000L');
assertContains(android, 'licenseConfig.revocationPollSeconds.coerceIn(5, 300) * 1_000L');
assertContains(android, 'decision.remainingSeconds in 1..300 -> minOf(decision.remainingSeconds * 1_000L, onlineRevokePollMs)');
assert.ok(!/delay\(waitMs\)\s*delay\(waitMs\)/.test(text(android)), `${android}: duplicate watchdog delay found`);

// Both iOS targets must enforce the license on a remaining-seconds-driven
// watchdog. Inside the Network Extension only `ExtensionLicenseGate` is
// usable: `LicenseManager` belongs to the app target and imports UIKit, which
// an app extension cannot use (it never compiled there — the failure was
// hidden behind the synthesized .ipa). The contract enforced here is the
// behaviour (enforce -> remainingSeconds -> sleep), not the class name.
for (const path of [
  'MICAFP/ios/UnifiedShield/NetworkExtension/PacketTunnelProvider.swift',
  'MICAFP/ios/UnifiedShield/NetworkExtension/TunnelManager.swift',
]) {
  assertContains(path, 'let status = await ExtensionLicenseGate.shared.enforce()');
  assertContains(path, 'let waitSeconds = max(Int64(1), min(status.remainingSeconds > 0 ? status.remainingSeconds : 60, Int64(60)))');
  assertOrder(path, 'let status = await ExtensionLicenseGate.shared.enforce()', 'try? await Task.sleep(nanoseconds: UInt64(waitSeconds) * 1_000_000_000)');
  // The extension must never reach for the UIKit-bound container-app manager.
  assert.ok(!text(path).includes('LicenseManager.shared'), `${path} must use the extension-safe license gate, not the UIKit-bound LicenseManager`);
}
// The container app's own pre-connect path keeps its UIKit-capable manager.
assertContains('MICAFP/ios/UnifiedShield/App/LicenseManager.swift', 'func enforce()');

const openwrtInit = 'MICAFP/openwrt/files/etc/init.d/unifiedshield';
assertContains(openwrtInit, 'LICENSE_WATCHDOG="/usr/libexec/unifiedshield/license-watchdog.sh"');
assertContains(openwrtInit, 'procd_open_instance license_watchdog');
assertContains(openwrtInit, 'procd_kill unifiedshield license_watchdog');

const openwrtWatchdog = 'MICAFP/openwrt/files/usr/libexec/unifiedshield/license-watchdog.sh';
assertContains(openwrtWatchdog, 'remainingSeconds');
assertContains(openwrtWatchdog, 'license hard cutoff');
assertContains(openwrtWatchdog, '"$SERVICE_INIT" stop');

const openwrtMakefile = 'MICAFP/openwrt/Makefile';
assertContains(openwrtMakefile, './files/usr/libexec/unifiedshield/license-watchdog.sh $(1)/usr/libexec/unifiedshield/license-watchdog.sh');

console.log('runtime_license_watchdog_gate: PASS');
