#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }
function lacks(path, needle) { assert.ok(!text(path).includes(needle), `${path} must not contain ${needle}`); }

const base = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';
const memory = `${base}/app/src/main/java/com/v2rayez/app/data/routing/AndroidAdaptiveRouteMemory.kt`;
const vm = `${base}/app/src/main/java/com/v2rayez/app/ui/viewmodel/ViewModels.kt`;
const service = `${base}/app/src/main/java/com/v2rayez/app/data/service/V2RayVpnService.kt`;
const di = `${base}/app/src/main/java/com/v2rayez/app/di/DataModule.kt`;
const doc = 'docs/ANDROID_ADAPTIVE_ROUTE_MEMORY.md';

for (const needle of [
  'interface AdaptiveRouteMemory',
  'class AndroidAdaptiveRouteMemory @Inject constructor',
  'fun rank(servers: List<Server>',
  'fun recordSuccess(server: Server, pingMs: Int, coreLabel: String)',
  'fun recordFailure(serverId: String, reason: String)',
  'currentFingerprint(): String',
  'TRANSPORT_WIFI',
  'TRANSPORT_CELLULAR',
  'metered=',
  'notRoaming=',
  'validated=',
  'cooldownUntil',
  'lastSuccessAt',
  'success * 500.0 - failure * 650.0',
  'phone numbers',
  'subscriber ids',
  'BSSIDs',
]) has(memory, needle);

for (const forbidden of [
  'READ_PHONE_STATE',
  'getDeviceId',
  'getSubscriberId',
  'getLine1Number',
  'WifiInfo',
  'getBSSID',
  'getSSID',
]) lacks(memory, forbidden);

has(di, 'bindAdaptiveRouteMemory');
has(vm, 'private val adaptiveRoutes: AdaptiveRouteMemory');
has(vm, 'val adaptiveRanked = adaptiveRoutes.rank(targets)');
has(vm, 'HOME_ADAPTIVE_HEAD');
has(service, '@Inject lateinit var adaptiveRoutes: AdaptiveRouteMemory');
has(service, 'adaptiveRoutes.recordSuccess(server, stateHolder.connectionState.value.pingMs, activeCoreType.label)');
has(service, 'adaptiveRoutes.recordFailure(it.id, message)');
for (const needle of [
  'Android Adaptive Route Memory',
  'per-network-class score table',
  'does **not** store phone numbers',
]) has(doc, needle);

console.log('android_adaptive_route_memory_gate: PASS');
