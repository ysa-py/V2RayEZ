#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }
function lacks(path, needle) { assert.ok(!text(path).includes(needle), `${path} must not contain ${needle}`); }

const base = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';
const manager = `${base}/license-admin/src/main/java/com/v2rayez/licenseadmin/OfflineLicenseManager.java`;
const admin = `${base}/license-admin/src/main/java/com/v2rayez/licenseadmin/MainActivity.java`;
const adminGradle = `${base}/license-admin/build.gradle.kts`;
const client = `${base}/app/src/main/java/com/v2rayez/app/data/license/AndroidLicenseRepository.kt`;
const model = `${base}/app/src/main/java/com/v2rayez/app/domain/model/ConfigModels.kt`;
const vm = `${base}/app/src/main/java/com/v2rayez/app/ui/viewmodel/LicenseAiViewModels.kt`;
const screen = `${base}/app/src/main/java/com/v2rayez/app/ui/screens/settings/LicenseScreen.kt`;
const strings = [
  `${base}/app/src/main/res/values/strings.xml`,
  `${base}/app/src/main/res/values-fa/strings.xml`,
  `${base}/app/src/main/res/values-ru/strings.xml`,
];
const docs = ['docs/SERVERLESS_LICENSE_MANAGER.md', 'docs/LICENSE_API.md'];

for (const needle of [
  'final class OfflineLicenseManager',
  'Ed25519PrivateKeyParameters',
  'Ed25519Signer',
  'Android Keystore',
  'AES/GCM/NoPadding',
  'PBKDF2WithHmacSHA256',
  'AES-256-GCM',
  'String issue(',
  'String renew(String licenseId, String expiresAt)',
  'String revoke(String licenseId, String reason)',
  'exportRevocationListToken()',
  'V2RayEZ-Revocation-List',
  'v2rayez-license-ledger.enc',
  'revocationEpoch',
  'ownerLabel',
  'deviceIdHash',
  'stableJson',
  '-----BEGIN PUBLIC KEY-----',
]) has(manager, needle);

for (const forbidden of [
  'LICENSE_ED25519_PRIVATE_KEY_PEM',
  'private static final String PRIVATE_KEY',
  'TODO',
]) lacks(manager, forbidden);

has(adminGradle, 'implementation(libs.bouncycastle.bcprov)');
for (const needle of [
  'V2RayEZ License Manager / Admin',
  'Offline issue serial',
  'Offline renew serial',
  'Offline revoke license',
  'Export encrypted ledger',
  'Import encrypted ledger',
  'Export revocation list',
  'offlineManager.issue',
  'offlineManager.renew',
  'offlineManager.revoke',
  'offlineManager.exportLedger',
  'offlineManager.importLedger',
]) has(admin, needle);

for (const needle of [
  'fun deviceHashForDisplay(config: LicenseConfig)',
  'payload.optString("deviceIdHash", "").trim()',
  'return deny("device_mismatch"',
  'private fun revocationDecision(',
  'REVOCATION_TOKEN_TYPE = "V2RayEZ-Revocation-List"',
  'return deny("license_revoked"',
]) has(client, needle);

has(model, 'val revocationListToken: String = ""');
has(vm, 'revocationListToken: String');
has(vm, 'previous.revocationListToken != next.revocationListToken');
has(screen, 'license_revocation_list_token');
has(screen, 'revocationListToken.trim()');
for (const path of strings) has(path, 'license_revocation_list_token');
for (const path of docs) {
  has(path, 'Offline');
  has(path, 'V2RayEZ-Revocation-List');
  has(path, 'deviceIdHash');
}

console.log('offline_license_manager_gate: PASS');
