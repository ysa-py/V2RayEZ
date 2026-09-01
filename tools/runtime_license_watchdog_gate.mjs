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
