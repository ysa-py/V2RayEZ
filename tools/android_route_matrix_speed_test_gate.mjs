#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }
function lacks(path, needle) { assert.ok(!text(path).includes(needle), `${path} must not contain ${needle}`); }

const base = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';
const vm = `${base}/app/src/main/java/com/v2rayez/app/ui/viewmodel/RouteSpeedTestViewModel.kt`;
const tools = `${base}/app/src/main/java/com/v2rayez/app/ui/screens/tools/ToolsScreen.kt`;
const screens = `${base}/app/src/main/java/com/v2rayez/app/ui/screens/tools/ToolScreens.kt`;
const routes = `${base}/app/src/main/java/com/v2rayez/app/ui/navigation/Routes.kt`;
const app = `${base}/app/src/main/java/com/v2rayez/app/ui/V2RayApp.kt`;
const docs = ['docs/ANDROID_ROUTE_MATRIX_SPEED_TEST.md', 'docs/V2RAYEZ_UNIVERSAL_REQUIREMENT_MAP.md'];
const strings = [
  `${base}/app/src/main/res/values/strings.xml`,
  `${base}/app/src/main/res/values-fa/strings.xml`,
  `${base}/app/src/main/res/values-ru/strings.xml`,
];

for (const needle of [
  'enum class RouteMatrixPhase',
  'QUALIFICATION',
  'STABILITY',
  'STRESS',
  'FINAL_ABBA',
  'enum class RouteDnsPreset',
  'CLOUDFLARE_ALIYUN',
  'QUAD9_ALIYUN',
  'ADGUARD_ALIYUN',
  'ALIYUN_ONLY',
  'FAKE_DNS',
  'enum class RouteFragmentPreset',
  'OFF("Off")',
  'FAST("Fast 64–128B")',
  'BALANCED("Balanced 100–200B")',
  'STEALTH("Stealth 256–512B")',
  'val mtu: Int',
  'MTU_PRESETS = listOf(1280, 1360, 1420, 1500)',
  'Edge × DNS × Fragment × MTU',
  'runStage(',
  'runFinalAbba(',
  'FINAL_ABBA_ORDER = listOf(0, 1, 1, 0)',
  'vpn.testLatencyQuick(candidate.edge)',
  'vpn.testSiteFetch(candidate.edge, url)',
  'throughputUrl(throughputBytes, idx)',
  'settings.update { candidate.applyTo(originalSettings) }',
  'settings.update { originalSettings }',
  'successRate * 450.0',
  'latencyScore * 90.0',
  'throughput * 18.0',
  'confidence * 120.0',
  'fun applyWinner()',
]) has(vm, needle);

for (const forbidden of ['TODO', 'NotImplementedError', 'throw UnsupportedOperationException']) lacks(vm, forbidden);

has(routes, 'const val ROUTE_SPEED_TEST = "route_speed_test"');
has(app, 'RouteSpeedTestScreen');
has(app, 'composable(Routes.ROUTE_SPEED_TEST)');
has(tools, '"matrix"');
has(tools, 'Routes.ROUTE_SPEED_TEST');
has(screens, 'fun RouteSpeedTestScreen(');
has(screens, 'RouteSpeedTestViewModel');
has(screens, 'routeRacePhaseLabel');
has(screens, 'RouteWinnerCard');
has(screens, 'RouteMatrixResultRow');
has(screens, 'routeRaceScoreLine');
has(screens, 'viewModel::applyWinner');

for (const path of strings) {
  has(path, 'route_race_title');
  has(path, 'route_race_phase_qualification');
  has(path, 'route_race_phase_stability');
  has(path, 'route_race_phase_stress');
  has(path, 'route_race_phase_final');
  has(path, 'route_race_apply_winner');
}
for (const path of docs) {
  has(path, 'Route Speed Test');
  has(path, 'Edge × DNS × Fragment × MTU');
  has(path, 'A/B/B/A');
}

console.log('android_route_matrix_speed_test_gate: PASS');
