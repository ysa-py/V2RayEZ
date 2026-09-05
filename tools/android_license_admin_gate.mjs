#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) {
  return readFileSync(path, 'utf8');
}

function assertContains(path, needle) {
  assert.ok(text(path).includes(needle), `${path} missing ${needle}`);
}

const base = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';
const settings = `${base}/settings.gradle.kts`;
const gradle = `${base}/license-admin/build.gradle.kts`;
const manifest = `${base}/license-admin/src/main/AndroidManifest.xml`;
const activity = `${base}/license-admin/src/main/java/com/v2rayez/licenseadmin/MainActivity.java`;
const releaseScript = 'scripts/build-release-artifacts.sh';
const licenseApiDoc = 'docs/LICENSE_API.md';

assertContains(settings, 'include(":license-admin")');
assertContains(gradle, 'applicationId = "com.v2rayez.licenseadmin"');
assertContains(gradle, 'minSdk = 26');
assertContains(gradle, 'targetSdk = 35');
assertContains(manifest, '<uses-permission android:name="android.permission.INTERNET" />');
assertContains(manifest, 'android:label="Vor License Manager"');
assertContains(manifest, 'android:usesCleartextTraffic="false"');

for (const endpoint of [
  '/api/licenses/issue',
  '/api/licenses/renew',
  '/api/licenses/revoke',
  '/api/licenses/validate',
  '/api/licenses/devices/revoke',
]) {
  assertContains(activity, endpoint);
}
assertContains(activity, 'Authorization", "Bearer " + token');
assertContains(activity, 'JSONObject body = new JSONObject()');
assertContains(activity, '.put("expiresAt", value(expiresAt))');
assertContains(activity, '.put("maxDevices", parseInt(value(maxDevices), 1))');
assertContains(activity, '.put("offlineGraceHours", parseInt(value(offlineGraceHours), 72))');
assertContains(activity, 'button("Dashboard revoke license", this::revoke)');
assertContains(activity, 'button("Dashboard revoke device", this::revokeDevice)');
assertContains(activity, '.put("activationId", value(activationId))');
assertContains(activity, '.put("deviceIdHash", value(deviceIdHash))');
assertContains(activity, 'if (stream == null) return "";');
assertContains(activity, 'Use HTTPS dashboard URL for admin operations');
assertContains(activity, 'Admin token is intentionally session-only and is not saved on device.');
assertContains(activity, 'dashboard revoke is immediate for clients that can reach validation');
assert.ok(!text(activity).includes('.putString("adminToken"'), `${activity}: admin token must not be persisted in SharedPreferences`);
assert.ok(!text(activity).includes('LICENSE_ED25519_PRIVATE_KEY'), `${activity}: admin app must not embed signing private keys`);
assertContains(activity, 'Offline issue serial');
assertContains(activity, 'Offline revoke license');

assertContains(releaseScript, './gradlew :app:assembleRelease :license-admin:assembleRelease');
assertContains(releaseScript, 'license-admin/build/outputs/apk/release/*.apk');
assertContains(licenseApiDoc, '## Android License Admin companion app');
assertContains(licenseApiDoc, 'Revocation is immediate in the dashboard database and audit log.');
assertContains(licenseApiDoc, 'fully offline client cannot receive an instant revoke packet');

console.log('android_license_admin_gate: PASS');
