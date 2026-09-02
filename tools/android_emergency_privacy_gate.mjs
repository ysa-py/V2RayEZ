#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }
function lacks(path, needle) { assert.ok(!text(path).includes(needle), `${path} must not contain ${needle}`); }

const base = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';
const repo = `${base}/app/src/main/java/com/v2rayez/app/domain/repository/Repositories.kt`;
const impl = `${base}/app/src/main/java/com/v2rayez/app/data/privacy/AndroidEmergencyPrivacyCleanup.kt`;
const di = `${base}/app/src/main/java/com/v2rayez/app/di/DataModule.kt`;
const daos = `${base}/app/src/main/java/com/v2rayez/app/data/local/Daos.kt`;
const vm = `${base}/app/src/main/java/com/v2rayez/app/ui/viewmodel/ViewModels.kt`;
const ui = `${base}/app/src/main/java/com/v2rayez/app/ui/screens/logs/LogsScreen.kt`;
const strings = `${base}/app/src/main/res/values/strings.xml`;
const fa = `${base}/app/src/main/res/values-fa/strings.xml`;
const ru = `${base}/app/src/main/res/values-ru/strings.xml`;
const doc = 'docs/ANDROID_EMERGENCY_PRIVACY_CLEANUP.md';

has(repo, 'interface EmergencyPrivacyCleanup');
has(repo, 'data class PrivacyCleanupResult');
has(impl, 'class AndroidEmergencyPrivacyCleanup @Inject constructor');
has(impl, 'vpn.disconnect()');
has(impl, 'logs.clear()');
has(impl, 'sessionDao.deleteAll()');
has(impl, 'dailyTrafficDao.deleteAll()');
has(impl, 'licenseRepository.clear()');
has(impl, 'exported_log_cache');
has(impl, 'does not promise\n * anonymity');
lacks(impl, 'deleteDatabase');
lacks(impl, 'deleteRecursively() }\n        }\n    }\n\n    private fun deleteChildren(root: File) {\n        if (!root.exists()) return\n        root.deleteRecursively()');

has(di, 'bindEmergencyPrivacyCleanup');
has(daos, '@Query("DELETE FROM sessions")');
has(daos, '@Query("DELETE FROM daily_traffic")');
has(vm, 'private val privacyCleanup: EmergencyPrivacyCleanup');
has(vm, 'fun emergencyPrivacyCleanup()');
has(ui, 'logs_privacy_cleanup_title');
has(ui, 'logs_privacy_cleanup_body');
has(ui, 'viewModel.emergencyPrivacyCleanup()');
has(ui, 'Icons.Filled.Security');

for (const file of [strings, fa, ru]) {
  for (const key of [
    'logs_privacy_cleanup',
    'logs_privacy_cleanup_title',
    'logs_privacy_cleanup_body',
    'logs_privacy_cleanup_confirm',
    'logs_privacy_cleanup_done',
    'logs_privacy_cleanup_partial',
  ]) has(file, `name="${key}"`);
}

for (const needle of [
  'Android Emergency Privacy Cleanup',
  'It does not claim that the user becomes unidentifiable',
  'does not delete server-side license dashboard audit records',
]) has(doc, needle);

console.log('android_emergency_privacy_gate: PASS');
