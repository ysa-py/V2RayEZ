#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }

const base = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';
const detector = `${base}/app/src/main/java/com/v2rayez/app/data/intranet/NationalIntranetDetector.kt`;
const vm = `${base}/app/src/main/java/com/v2rayez/app/ui/viewmodel/DiagnosticsViewModel.kt`;
const ui = `${base}/app/src/main/java/com/v2rayez/app/ui/screens/tools/ToolScreens.kt`;
const strings = `${base}/app/src/main/res/values/strings.xml`;
const fa = `${base}/app/src/main/res/values-fa/strings.xml`;
const ru = `${base}/app/src/main/res/values-ru/strings.xml`;
const doc = 'docs/ANDROID_NATIONAL_INTRANET_DIAGNOSTICS.md';

for (const needle of [
  'enum class NationalIntranetState',
  'DOMESTIC_ONLY',
  'PARTIAL_RESTRICTION',
  'OFFLINE',
  'class NationalIntranetDetector @Inject constructor',
  'DOMESTIC_TARGETS',
  'INTERNATIONAL_TARGETS',
  'it does not claim that a phone can reach the global internet',
]) has(detector, needle);

for (const needle of [
  'private val intranetDetector: NationalIntranetDetector',
  'SEC_INTRASHUTDOWN',
  'ID_INTRASTATE',
  'ID_DOMESTIC_REACHABILITY',
  'ID_INTERNATIONAL_REACHABILITY',
  'ID_SERVERLESS_LIMITS',
  'runNationalIntranetAwareness()',
  'pure serverless mode cannot bypass a total upstream cut by itself',
  'Global access still requires a reachable peer/relay/gateway',
]) has(vm, needle);

for (const needle of [
  'R.string.diag_sec_intranet_shutdown',
  'R.string.diag_check_intranet_state',
  'R.string.diag_check_domestic_reachability',
  'R.string.diag_check_international_reachability',
  'R.string.diag_check_serverless_limits',
]) has(ui, needle);

for (const file of [strings, fa, ru]) {
  for (const key of [
    'diag_sec_intranet_shutdown',
    'diag_check_intranet_state',
    'diag_check_domestic_reachability',
    'diag_check_international_reachability',
    'diag_check_serverless_limits',
  ]) has(file, `name="${key}"`);
}

for (const needle of [
  'Android National Intranet / Shutdown Diagnostics',
  'does **not** claim that a phone can reach the global internet',
  'international egress requires a reachable peer/relay/gateway',
]) has(doc, needle);

console.log('android_national_intranet_gate: PASS');
