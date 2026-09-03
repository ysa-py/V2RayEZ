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
const planner = `${base}/app/src/main/java/com/v2rayez/app/data/diagnostics/SmartRepairPlanner.kt`;
const diagnosticsVm = `${base}/app/src/main/java/com/v2rayez/app/ui/viewmodel/DiagnosticsViewModel.kt`;
const diagnosticsUi = `${base}/app/src/main/java/com/v2rayez/app/ui/screens/tools/ToolScreens.kt`;
const vpnController = `${base}/app/src/main/java/com/v2rayez/app/data/repository/RealVpnController.kt`;

for (const id of [
  'ENABLE_TUN_DNS',
  'NORMALIZE_LOCAL_PORTS',
  'NORMALIZE_MTU',
  'SYNC_LAN_SHARING',
  'ENABLE_AI_LOCAL_FALLBACK',
  'RESET_INVALID_DNS',
  'PRIORITIZE_TOR_OVER_FRONTING',
  'ALIGN_LOCKDOWN_REQUEST',
]) {
  assertContains(planner, id);
}

assertContains(planner, 'settings.copy(enableLocalDns = true, enableSniffing = true)');
assertContains(planner, 'settings.copy(socksPort = normalizedSocks, httpPort = normalizedHttp)');
assertContains(planner, 'settings.copy(allowLan = enabled, enableLanSharing = enabled)');
assertContains(planner, 'autoFallbackToLocal = true');
assertContains(planner, 'baseUrl = "local://v2rayez"');
assertContains(planner, 'domainFront = settings.domainFront.copy(enabled = false)');
assert.ok(!/delete(Server|Subscription|All|\()/i.test(text(planner)), `${planner}: smart repair must not delete user data`);
assert.ok(!/servers?\s*=\s*emptyList\(\)/.test(text(planner)), `${planner}: smart repair must not wipe servers`);

assertContains(diagnosticsVm, 'SmartRepairPlanner.plan(before, connected = conn.status == ConnectionStatus.CONNECTED)');
assertContains(diagnosticsVm, 'settings.update { plan.settings }');
assertContains(diagnosticsVm, 'vpn.connect(conn.server)');
assertContains(diagnosticsVm, 'val repair: DiagnosticsRepairState = DiagnosticsRepairState()');

assertContains(diagnosticsUi, 'R.string.diag_smart_repair');
assertContains(diagnosticsUi, 'viewModel::autoRepair');
assertContains(diagnosticsUi, 'R.string.diag_repair_summary_format');
assertContains(diagnosticsUi, 'Smart repair: ${state.repair.applied.size} applied');

assertContains(vpnController, 'SmartRepairPlanner.plan');
assertContains(vpnController, 'startLicensedForegroundService');
assert.ok(!/delete(Server|Subscription|All|\()/i.test(text(vpnController)), `${vpnController}: connect preflight must not delete user data`);

for (const rel of ['values/strings.xml', 'values-fa/strings.xml', 'values-ru/strings.xml']) {
  const path = `${base}/app/src/main/res/${rel}`;
  assertContains(path, 'name="diag_smart_repair"');
  assertContains(path, 'name="diag_repair_summary_format"');
}

console.log('android_smart_repair_gate: PASS');
