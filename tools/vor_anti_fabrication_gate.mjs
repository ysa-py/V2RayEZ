#!/usr/bin/env node
// Anti-fabrication gate for Vor.
//
// This gate is deliberately stricter than a "code path exists" check. It:
//   1. Performs a real Ed25519 sign/verify/tamper test through license-crypto.mjs.
//   2. Rejects Math.random()-based metric fabrication in production dashboard API
//      routes (the exact MICAFP/aether-x failure mode).
//   3. Requires any dashboard `src/lib` module that still uses Math.random() to be
//      explicitly labeled `SIMULATION ONLY — NOT REAL TELEMETRY`.
//   4. Requires fail-closed `real_core_backend_unavailable` responses where the
//      dashboard would otherwise present live-looking telemetry.
//   5. Re-checks the release artifact builder cannot emit placeholder binaries.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateEd25519KeyPairPem, signLicensePayload, verifyLicenseKey } from '../MICAFP/dashboard/src/lib/license-crypto.mjs';

// ── 1. Behavioral crypto check ───────────────────────────────────────────────
(() => {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPairPem();
  const keyId = 'anti-fabrication-gate';
  const payload = {
    licenseId: 'lic_anti_fabrication',
    userId: 'user_gate',
    accountId: 'acct_gate',
    status: 'ACTIVE',
    issuedAt: '2030-01-01T00:00:00.000Z',
    expiresAt: '2031-01-01T00:00:00.000Z',
    maxDevices: 1,
    offlineGraceHours: 24,
    features: ['vpn'],
  };
  const token = signLicensePayload(payload, privateKeyPem, keyId);
  assert.ok(token.split('.').length === 3, 'signed license token must be compact');
  assert.equal(verifyLicenseKey(token, { [keyId]: publicKeyPem }).licenseId, payload.licenseId);

  const parts = token.split('.');
  const tamperedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  tamperedPayload.status = 'REVOKED';
  parts[1] = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url').replace(/=+$/, '');
  assert.throws(() => verifyLicenseKey(parts.join('.'), { [keyId]: publicKeyPem }), /signature|verify/i);
})();

// ── 2. Production API route fabrication scan ─────────────────────────────────
const apiRoot = 'MICAFP/dashboard/src/app/api';
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('///');
}

let failures = 0;
for (const file of walk(apiRoot)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isCommentLine(line)) return;
    if (line.includes('Math.random') || line.includes('Math.random()')) {
      console.error(`FABRICATED METRIC: ${file}:${index + 1}: ${line.trim()}`);
      failures += 1;
    }
  });
}

// Dynamic telemetry routes must fail closed when no real core backend is attached.
const telemetryRoutes = [
  'MICAFP/dashboard/src/app/api/health/route.ts',
  'MICAFP/dashboard/src/app/api/cores/route.ts',
  'MICAFP/dashboard/src/app/api/auto-reconnect/route.ts',
  'MICAFP/dashboard/src/app/api/orchestrator/route.ts',
  'MICAFP/dashboard/src/app/api/dpi-test/route.ts',
  'MICAFP/dashboard/src/app/api/geo-router/route.ts',
  'MICAFP/dashboard/src/app/api/ota/route.ts',
  'MICAFP/dashboard/src/app/api/ai-engine/route.ts',
  'MICAFP/dashboard/src/app/api/security-audit/route.ts',
  'MICAFP/dashboard/src/app/api/threat-intel/route.ts',
];
for (const file of telemetryRoutes) {
  const body = existsSync(file) ? readFileSync(file, 'utf8') : '';
  assert.ok(body.includes('real_core_backend_unavailable'), `${file}: dynamic telemetry route must fail closed with real_core_backend_unavailable`);
  assert.ok(!body.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').includes('Math.random'), `${file}: production route must not call Math.random`);
}

// ── 3. Simulation-only labeling for any lib that still uses Math.random ──────
const simMarker = 'SIMULATION ONLY — NOT REAL TELEMETRY';
for (const file of [
  'MICAFP/dashboard/src/lib/auto-scanner-engine.ts',
  'MICAFP/dashboard/src/lib/network-analyzer.ts',
  'MICAFP/dashboard/src/lib/security-audit.ts',
  'MICAFP/dashboard/src/lib/stealth-rotation.ts',
  'MICAFP/dashboard/src/lib/unified-shield-store-p2p-intranet.ts',
  'MICAFP/dashboard/src/lib/unified-shield-store.ts',
]) {
  const body = readFileSync(file, 'utf8');
  if (body.includes('Math.random')) {
    assert.ok(body.includes(simMarker), `${file}: random-based simulation library must declare SIMULATION ONLY — NOT REAL TELEMETRY`);
  }
}

// ── 4. Release artifact contract reinforcement ───────────────────────────────
const buildScript = readFileSync('scripts/build-release-artifacts.sh', 'utf8');
for (const forbidden of [
  'touch "$ARTIFACT_DIR',
  'echo "placeholder"',
  'FAKE_',
]) {
  assert.ok(!buildScript.includes(forbidden), `release builder contains placeholder marker: ${forbidden}`);
}

// ── 5. Android MICAFP donor fail-closed audit ────────────────────────────────
const andRoot = 'MICAFP/android/app/src/main/kotlin/com/unifiedshield';
function readAndroid(rel) {
  return readFileSync(join(andRoot, rel), 'utf8');
}
function stripCommentsAndStrings(text) {
  // Remove comments and string literals so anti-fabrication checks do not trip
  // on documentation text that merely describes old fabricated behavior.
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(\\.|[^"\\])*"/g, '""')
    .replace(/'(\\.|[^'\\])*'/g, "''")
    .replace(/`(\\.|[^`\\])*`/g, '""');
}

// Fail-closed cleaned production engines. Any non-comment `Random` usage here is
// rejected. The two scalar backoff helpers are the only allowed exceptions.
const androidCleaned = [
  'micafp/EbpfSocketFilterEngine.kt',
  'micafp/MicafpKernelRingBufferEngine.kt',
  'micafp/DiagnosticTelemetryService.kt',
  'micafp/MicafpQuantumMorphProtocol.kt',
  'micafp/OnDeviceNeuralReconEngine.kt',
  'micafp/TfLitePacketAnalyzerEngine.kt',
  'AiStealthEngine.kt',
  'DpiDiagnosticEngine.kt',
  'aiorchestrator/AdaptiveNetworkProfiler.kt',
  'aiorchestrator/AiCoreOrchestrator.kt',
  'aiorchestrator/DpiTfLiteAnomalyDetector.kt',
  'resilience/NetworkClientManager.kt',
  'tunnel/DualModeTransportEngine.kt',
  'UnifiedShieldStore.kt',
  'security/SecurityController.kt',
  'cottendns/CottenDnsEngine.kt',
  'cottendns/CottenDnsModels.kt',
  'stormdns/StormDnsEngine.kt',
  'stormdns/StormDnsModels.kt',
  'tunnel/MasterDnsConfig.kt',
  'tunnel/MasterDnsEngine.kt',
  'tunnel/TunnelProfile.kt',
  'whitedns/WhiteDnsModels.kt',
  'whitedns/WhiteDnsScannerEngine.kt',
  'logging/DebugLogger.kt',
  'profile/ProfileManager.kt',
  'scanner/AutoScannerEngine.kt',
  'ui/CottenDnsScreen.kt',
  'ui/TunnelsScreen.kt',
  'ui/ThreatIntelPanel.kt',
  'ui/MasterDnsScreen.kt',
  'ui/StormDnsScreen.kt',
  'ui/WhiteDnsScreen.kt',
];
for (const rel of androidCleaned) {
  const body = readAndroid(rel);
  const code = stripCommentsAndStrings(body);
  if (code.includes('Random.next')) {
    const allowedBackoff =
      (rel === 'aiorchestrator/AiCoreOrchestrator.kt' && code.includes('val jitter = Random.nextLong(100, 400)')) ||
      (rel === 'resilience/NetworkClientManager.kt' && code.includes('Random.nextDouble(config.jitterMultiplierMin')) ||
      (rel === 'security/SecurityController.kt' && code.includes('secureRandom.nextBytes'));
    assert.ok(allowedBackoff, `${rel}: production engine must not fabricate telemetry with Random.next*`);
  }
  if (code.includes('import kotlin.random.Random')) {
    const allowedBackoff =
      rel === 'aiorchestrator/AiCoreOrchestrator.kt' || rel === 'resilience/NetworkClientManager.kt';
    assert.ok(allowedBackoff, `${rel}: Random import not permitted in fail-closed engine`);
  }
}

// AutoScanner still uses `.random()` for CANDIDATE target enumeration only (never
// for measured metrics). Lock that boundary in so it cannot regress into fabrication.
{
  const body = readAndroid('scanner/AutoScannerEngine.kt');
  assert.ok(body.includes('REAL DISCOVERY ONLY'), 'AutoScannerEngine dynamic probe synthesis must be labeled REAL DISCOVERY ONLY');
  assert.ok(!body.includes('getInitialVerifiedNodes'), 'AutoScannerEngine must not reseed fake verified nodes');
  assert.ok(body.includes('results = emptyList()'), 'AutoScannerEngine must fail closed with an empty result list');
  assert.ok(body.includes('backendUnavailable = true'), 'AutoScannerEngine must expose backendUnavailable');
  assert.ok(body.includes('cleanNodesCount = 0'), 'AutoScannerEngine must not fabricate a clean-node count');
  assert.ok(body.includes('is not a real measured result'), 'AutoScannerEngine applyScannedNode must refuse unmeasured nodes');
}

// ProfileManager and TunnelProfile must not present default catalog pings as measured.
{
  const body = readAndroid('profile/ProfileManager.kt');
  assert.ok(!/\bpingMs\s*=\s*[1-9]\d*\b/.test(body), 'ProfileManager default profiles must not carry fabricated ping values');
  assert.ok(body.includes('scannedNode.measured'), 'ProfileManager.autoApplyFromScanner must require a measured scanner node');
  assert.ok(body.includes('measured = true'), 'ProfileManager must mark auto-applied measured profile explicitly');
  const profile = readAndroid('tunnel/TunnelProfile.kt');
  assert.ok(/pingMs:\s*Int\s*=\s*0/.test(profile), 'TunnelProfile default must be fail-closed pingMs = 0');
  assert.ok(/measured:\s*Boolean\s*=\s*false/.test(profile), 'TunnelProfile must carry a measured flag defaulting false');
}

// UnifiedShieldStore threat optimization must be metadata-only and must not feed
// fabricated latency/throughput into AiStealthEngine.
{
  const body = readAndroid('UnifiedShieldStore.kt');
  assert.ok(body.includes('backendUnavailable'), 'UnifiedShieldStore must expose backendUnavailable');
  assert.ok(!body.includes('latencyMs = 16'), 'UnifiedShieldStore must not feed fabricated latency into AiStealthEngine');
  assert.ok(body.includes('isOptimized = false'), 'UnifiedShieldStore must not mark optimization as applied without measurement');
}

// DNS engines guard the real-data entry points on a measured flag.
for (const rel of ['cottendns/CottenDnsEngine.kt', 'stormdns/StormDnsEngine.kt', 'tunnel/MasterDnsEngine.kt']) {
  const body = readAndroid(rel);
  assert.ok(body.includes('!sample.measured'), `${rel}: real-data sample entry must refuse unmeasured samples`);
}

// Decorative visualizations may use Random, but only when explicitly labeled
// simulation / visualization-only and never as live telemetry.
const androidSimulationOnly = [
  'ui/Quantum3DParticleCanvas.kt',
];
for (const rel of androidSimulationOnly) {
  const body = readAndroid(rel);
  assert.ok(body.includes('SIMULATION ONLY') || body.includes('VISUALIZATION ONLY'), `${rel}: random-based visual module must be labeled simulation/visualization only`);
}

// Facade check: attach/execute helpers in the cleaned layer must fail closed.
const ebpfBody = readAndroid('micafp/EbpfSocketFilterEngine.kt');
assert.ok(ebpfBody.includes('return false'), 'EbpfSocketFilterEngine.attachSocketFilter must fail closed');
assert.ok(ebpfBody.includes('backendUnavailable'), 'EbpfSocketFilterEngine must expose backendUnavailable');

// Each cleaned production engine/state store must carry an honest unavailable state/note.
const androidEnginesWithHonestNote = [
  'micafp/EbpfSocketFilterEngine.kt',
  'micafp/MicafpKernelRingBufferEngine.kt',
  'micafp/DiagnosticTelemetryService.kt',
  'micafp/MicafpQuantumMorphProtocol.kt',
  'micafp/OnDeviceNeuralReconEngine.kt',
  'micafp/TfLitePacketAnalyzerEngine.kt',
  'AiStealthEngine.kt',
  'DpiDiagnosticEngine.kt',
  'aiorchestrator/AdaptiveNetworkProfiler.kt',
  'aiorchestrator/AiCoreOrchestrator.kt',
  'aiorchestrator/DpiTfLiteAnomalyDetector.kt',
  'resilience/NetworkClientManager.kt',
  'tunnel/DualModeTransportEngine.kt',
  'UnifiedShieldStore.kt',
  'cottendns/CottenDnsEngine.kt',
  'stormdns/StormDnsEngine.kt',
  'tunnel/MasterDnsEngine.kt',
  'whitedns/WhiteDnsScannerEngine.kt',
  'scanner/AutoScannerEngine.kt',
];
for (const rel of androidEnginesWithHonestNote) {
  const body = readAndroid(rel);
  const hasNote = body.includes('backendUnavailable') || body.includes('No real ') || body.includes('not wired in');
  assert.ok(hasNote, `${rel}: cleaned Android engine must state an honest unavailable/backend note`);
}

// Consuming UI must not show the removed fabricated numbers as live success.
const panel = readAndroid('ui/MicafpQuantumDashboardPanel.kt');
assert.ok(panel.includes('UNAVAILABLE'), 'MicafpQuantumDashboardPanel must render honest unavailable states');
assert.ok(!stripCommentsAndStrings(panel).includes('Kyber-1024'), 'MicafpQuantumDashboardPanel must not display fabricated Kyber-1024 live claim');
for (const rel of [
  'ui/AiEngineScreen.kt',
  'ui/StatusCard.kt',
  'ui/ThreatIntelPanel.kt',
  'ui/DpiDiagnosticScreen.kt',
  'ui/AdvancedToolsScreen.kt',
  'ui/DualModeTransportScreen.kt',
  'ui/DiagnosticTelemetryCharts.kt',
  'ui/MasterDnsScreen.kt',
  'ui/StormDnsScreen.kt',
  'ui/WhiteDnsScreen.kt',
  'ui/CottenDnsScreen.kt',
  'ui/TunnelsScreen.kt',
]) {
  const body = readAndroid(rel);
  assert.ok(
    body.includes('unavailable') || body.includes('UNAVAILABLE') || body.includes('unmeasured'),
    `${rel}: consumer UI must render honest unavailable/unmeasured states`,
  );
}

// The newly cleaned DNS/scanner/profile UIs must gate numeric rendering on a
// measured flag/backend availability instead of showing 0ms/0% as live data.
for (const rel of ['ui/MasterDnsScreen.kt', 'ui/StormDnsScreen.kt', 'ui/CottenDnsScreen.kt']) {
  const body = readAndroid(rel);
  assert.ok(body.includes('measured'), `${rel}: DNS UI must gate metrics on measured/backend availability`);
}

// ── 6. Remaining synthetic-Random inventory (documented, not silent) ─────────
// The Android production pipeline is now fail-closed for measured telemetry.
// Remaining uses are explicitly NON-telemetry: AutoScanner candidate target
// enumeration (real probing backend is not yet wired) and the decorative particle
// canvas. These are intentionally flagged rather than silently allowed.
const remainingNonTelemetryRandom = [
  'scanner/AutoScannerEngine.kt — candidate target enumeration only (REAL DISCOVERY ONLY)',
  'ui/Quantum3DParticleCanvas.kt — decorative visualization only (VISUALIZATION ONLY)',
];
console.log(
  `vor_anti_fabrication_gate: NOTE — ${remainingNonTelemetryRandom.length} non-telemetry Random uses remain; they are not fabricated measurements and are explicitly labeled.`,
);
for (const entry of remainingNonTelemetryRandom) {
  console.log(`  inventory: ${entry}`);
}

if (failures > 0) {
  console.error(`vor_anti_fabrication_gate: FAIL — ${failures} fabrication instance(s) remain in production API routes.`);
  process.exit(1);
}
console.log(
  'vor_anti_fabrication_gate: PASS — real crypto verified; dashboard Math.random clean; Android cleaned donor engines fail closed with honest unavailable states; ProfileManager/UnifiedShieldStore/UI fail-closed assertions pass; remaining Random uses are explicitly non-telemetry.',
);
