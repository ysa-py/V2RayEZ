#!/usr/bin/env node
// Vor brand-rename evidence gate.
//
// Verifies the tracked, user-facing brand rename from V2RayEZ to Vor across the
// shipping surfaces. It intentionally does NOT require removal of internal/donor
// identifiers (e.g. `com.v2rayez.*`, `V2RayEZ-License`, `v2rayez.license.v1`,
// donor source trees) which are retained for compatibility and documented in
// CONTINUATION_REPORT.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }
function lacks(path, needle) { assert.ok(!text(path).includes(needle), `${path} must not contain ${needle}`); }

const base = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';

// Android: launcher label + license-admin display label are user-facing.
for (const locale of ['', '-fa', '-ru']) {
  has(`${base}/app/src/main/res/values${locale}/strings.xml`, '<string name="app_name">Vor</string>');
}
has(`${base}/license-admin/src/main/AndroidManifest.xml`, 'android:label="Vor License Manager"');
has(`${base}/license-admin/src/main/java/com/v2rayez/licenseadmin/MainActivity.java`, 'text("Vor License Manager / Admin"');

// iOS: bundle identifiers / app-group + product name migrated; internal target
// file paths (`V2RayEZPacketTunnel`) intentionally stay.
has('MICAFP/ios/project.yml', 'bundleIdPrefix: app.vor');
has('MICAFP/ios/project.yml', 'PRODUCT_BUNDLE_IDENTIFIER: app.vor.ios');
has('MICAFP/ios/project.yml', 'PRODUCT_NAME: Vor');
has('MICAFP/ios/Info.plist', '<string>Vor</string>');
has('MICAFP/ios/Info.plist', 'app.vor.ios');
lacks('MICAFP/ios/Info.plist', 'app.v2rayez.ios');
has('MICAFP/ios/V2RayEZPacketTunnel/Info.plist', 'app.vor.ios.PacketTunnel');
has('MICAFP/ios/V2RayEZPacketTunnel/Info.plist', '<string>Vor Packet Tunnel</string>');
has('MICAFP/ios/UnifiedShield/App/StatusView.swift', 'navigationTitle("Vor")');

// Desktop / Tauri: productName, bundle identifier, window title, package id.
has('V2RayEZ-GUI/src-tauri/tauri.conf.json', '"productName": "Vor"');
has('V2RayEZ-GUI/src-tauri/tauri.conf.json', '"identifier": "app.vor.universal"');
has('V2RayEZ-GUI/src-tauri/tauri.conf.json', '"title": "Vor"');
has('V2RayEZ-GUI/package.json', '"name": "@vor/universal-gui"');
lacks('V2RayEZ-GUI/src-tauri/tauri.conf.json', 'app.v2rayez.universal');
has('V2RayEZ-GUI/src/index.html', '<title>Vor</title>');
has('V2RayEZ-GUI/src/index.html', '<strong id="pageTitle">Vor</strong>');

// Dashboard: app name + visible strings.
has('MICAFP/dashboard/package.json', '"name": "vor-universal-dashboard"');
has('MICAFP/dashboard/src/lib/i18n.tsx', "'app.title': 'Vor Universal'");

// Brand assets: the canonical glass/gradient "V" mark keeps its aria-label but
// now carries the final product name.
for (const p of ['brand/v2rayez-logo.svg', 'V2RayEZ-GUI/src-tauri/icons/icon.svg', 'V2RayEZ-GUI/src/v2rayez-logo.svg', 'MICAFP/dashboard/public/logo.svg']) {
  has(p, 'aria-label="Vor"');
}

// OpenWrt LuCI: user-facing strings use Vor; internal package name
// (`unifiedshield`) intentionally stays for compatibility.
has('MICAFP/openwrt/src/luci-app-unifiedshield/Makefile', 'LUCI_TITLE:=LuCI support for Vor router VPN');
has('MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/controller/unifiedshield.lua', '_("Vor Universal")');
has('MICAFP/openwrt/files/etc/config/unifiedshield', "option name 'Vor Local AI'");

console.log('vor_brand_rename_gate: PASS — user-facing product strings, iOS bundle IDs, desktop product metadata, dashboard + OpenWrt/LuCI labels, and brand assets use Vor; internal/donor identifiers remain documented.');
