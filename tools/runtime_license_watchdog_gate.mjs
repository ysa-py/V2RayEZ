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


const androidLicenseScreen = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/ui/screens/settings/LicenseScreen.kt';
assertContains(androidLicenseScreen, 'lastServerTime = config.lastServerTime');
assertContains(androidLicenseScreen, 'license_server_time_format');

const androidConfigModel = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/domain/model/ConfigModels.kt';
assertContains(androidConfigModel, 'val lastServerTime: String = ""');

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
assertContains(extensionProtocol, 'licenseLastServerTime?: string;');
assertContains(extensionProtocol, 'licenseGraceServerTime?: string;');

for (const path of [
  'MICAFP/extensions/chrome/background/service-worker.ts',
  'MICAFP/extensions/firefox/background/background.ts',
]) {
  assertContains(path, 'clientLastServerTime: config.licenseLastServerTime || undefined');
  assertContains(path, 'config.licenseLastServerTime = serverTime;');
  assertContains(path, 'config.licenseGraceServerTime = String(gracePayload.serverTime || serverTime ||');
  assertContains(path, 'using_signed_grace');
  assertContains(path, 'isHardCachedDenial(cached)');
  assertContains(path, 'verifyGraceToken(graceToken, publicKeyPem)');
  assertContains(path, "license_public_key_missing");
  assertContains(path, 'server_time_rollback_detected');
}

for (const path of [
  'MICAFP/extensions/chrome/options/options.html',
  'MICAFP/extensions/firefox/options/options.html',
]) {
  assertContains(path, 'id="licensePublicKeyPem"');
  assertContains(path, 'Required for signed offline grace verification');
  assertContains(path, 'id="licenseLastServerTime"');
  assertContains(path, 'Last trusted server time');
}

for (const path of [
  'MICAFP/extensions/chrome/options/options.ts',
  'MICAFP/extensions/firefox/options/options.ts',
]) {
  assertContains(path, 'licensePublicKeyPem: document.getElementById');
  assertContains(path, 'licenseLastServerTime: document.getElementById');
  assertContains(path, "config.licenseLastServerTime || 'Not validated yet'");
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
assertContains(android, 'decision.remainingSeconds in 1..60 -> decision.remainingSeconds * 1_000L');
assert.ok(!/delay\(waitMs\)\s*delay\(waitMs\)/.test(text(android)), `${android}: duplicate watchdog delay found`);

for (const [path, gate] of [
  ['MICAFP/ios/UnifiedShield/NetworkExtension/PacketTunnelProvider.swift', 'ExtensionLicenseGate.shared.enforce()'],
  ['MICAFP/ios/UnifiedShield/NetworkExtension/TunnelManager.swift', 'LicenseManager.shared.enforce()'],
]) {
  assertContains(path, `let status = await ${gate}`);
  assertContains(path, 'let waitSeconds = max(Int64(1), min(status.remainingSeconds > 0 ? status.remainingSeconds : 60, Int64(60)))');
  assertOrder(path, `let status = await ${gate}`, 'try? await Task.sleep(nanoseconds: UInt64(waitSeconds) * 1_000_000_000)');
}

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
