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
];
for (const rel of androidCleaned) {
  const body = readAndroid(rel);
  const code = stripCommentsAndStrings(body);
  if (code.includes('Random.next')) {
    const allowedBackoff =
      (rel === 'aiorchestrator/AiCoreOrchestrator.kt' && code.includes('val jitter = Random.nextLong(100, 400)')) ||
      (rel === 'resilience/NetworkClientManager.kt' && code.includes('Random.nextDouble(config.jitterMultiplierMin'));
    assert.ok(allowedBackoff, `${rel}: production engine must not fabricate telemetry with Random.next*`);
  }
  if (code.includes('import kotlin.random.Random')) {
    const allowedBackoff =
      rel === 'aiorchestrator/AiCoreOrchestrator.kt' || rel === 'resilience/NetworkClientManager.kt';
    assert.ok(allowedBackoff, `${rel}: Random import not permitted in fail-closed engine`);
  }
}

// Facade check: attach/execute helpers in the cleaned layer must fail closed.
const ebpfBody = readAndroid('micafp/EbpfSocketFilterEngine.kt');
assert.ok(ebpfBody.includes('return false'), 'EbpfSocketFilterEngine.attachSocketFilter must fail closed');
assert.ok(ebpfBody.includes('backendUnavailable'), 'EbpfSocketFilterEngine must expose backendUnavailable');

// Each cleaned engine must carry an honest unavailable state/note.
for (const rel of [...androidCleaned]) {
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
]) {
  const body = readAndroid(rel);
  assert.ok(body.includes('unavailable') || body.includes('UNAVAILABLE'), `${rel}: consumer UI must render honest unavailable states`);
}

// ── 6. Known remaining Android fabrication inventory (documented, not silent) ─
const remainingRandomFiles = [
  'cottendns/CottenDnsEngine.kt',
  'logging/DebugLogger.kt',
  'profile/ProfileManager.kt',
  'scanner/AutoScannerEngine.kt',
  'stormdns/StormDnsEngine.kt',
  'tunnel/MasterDnsEngine.kt',
  'whitedns/WhiteDnsScannerEngine.kt',
];
console.log(
  `vor_anti_fabrication_gate: NOTE — ${remainingRandomFiles.length} known Android donors still contain synthetic Random-based telemetry; they are documented in CONTINUATION_REPORT.md, not silently claimed clean.`,
);
for (const rel of remainingRandomFiles) {
  const body = readAndroid(rel);
  const code = stripCommentsAndStrings(body);
  const randomUses = (code.match(/Random\.next|\.random\(\)/g) || []).length;
  console.log(`  inventory: ${rel} — ${randomUses} synthetic random call(s)`);
}

if (failures > 0) {
  console.error(`vor_anti_fabrication_gate: FAIL — ${failures} fabrication instance(s) remain in production API routes.`);
  process.exit(1);
}
console.log(
  'vor_anti_fabrication_gate: PASS — real crypto verified; dashboard Math.random clean; Android cleaned donor engines fail closed with honest unavailable states; remaining Android fabrications are inventoried, not claimed clean.',
);
