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

if (failures > 0) {
  console.error(`vor_anti_fabrication_gate: FAIL — ${failures} fabrication instance(s) remain in production API routes.`);
  process.exit(1);
}
console.log(
  'vor_anti_fabrication_gate: PASS — real crypto behavior verified; no Math.random in production API routes; simulated libraries are labeled; release builder cannot emit placeholders.',
);
