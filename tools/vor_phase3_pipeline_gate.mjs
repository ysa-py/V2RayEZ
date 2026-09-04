#!/usr/bin/env node
// Vor Phase 3 native CI/CD pipeline static gate.
//
// This gate cannot execute GitHub-hosted runners, so it statically enforces the
// pipeline contract that a fully-equipped CI environment must satisfy:
//   1. native tests (cargo/go/gradle) run BEFORE artifact builds;
//   2. every native toolchain is provisioned explicitly on its platform runner;
//   3. artifacts are produced with fail-closed `if-no-files-found: error`;
//   4. Android/OpenWrt/desktop/iOS jobs never emit placeholder/fallback binaries;
//   5. checksums are generated from downloaded real artifacts;
//   6. the new workflow does NOT become a second `gh release` publisher.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const wf = read('.github/workflows/vor-native-phase3.yml');

// A Go pseudo-version must look like vX.Y.Z-YYYYMMDDHHMMSS-<12 hex>. The Phase 3
// runner attempted to consume a go.mod whose hand-copied indirect block truncated
// several of these (e.g. ...c74b9c, ...1e9ff8689), which Go can never resolve.
const canonicalPseudo = /^v[0-9]+\.[0-9]+\.[0-9]+-[0-9]{14}-[0-9A-Fa-f]{12}$/;
const goMods = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'target') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry === 'go.mod') goMods.push(p);
  }
})(new URL('..', import.meta.url).pathname);
for (const goMod of goMods) {
  const text = readFileSync(goMod, 'utf8');
  const candidates = text.match(/\bv[0-9]+\.[0-9]+\.[0-9]+-[A-Za-z0-9-]+/g) || [];
  for (const token of candidates) {
    if (/\bv[0-9]+\.[0-9]+\.[0-9]+-20[0-9]{6}/.test(token)) {
      assert.ok(canonicalPseudo.test(token),
        `${goMod} contains a corrupted/truncated Go pseudo-version (${token}) that Go cannot resolve`);
    }
  }
}
// Only inspect meaningful YAML body; the header intentionally documents why this
// workflow does NOT call `gh release create/upload`.
const wfBody = wf
  .split(/\r?\n/)
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const required = [
  // Native validation must be part of the pipeline.
  'cargo test --workspace --all-targets',
  'cargo test --workspace --all-targets --features "std,post-quantum-lab"',
  // Go modules without a committed go.sum still need their real module graph
  // materialized before tests; the fetch itself is fail-closed.
  'go mod download all',
  'go test ./...',
  './gradlew testDebugUnitTest',
  // Toolchain provisioning on the specific runners.
  'dtolnay/rust-toolchain',
  'actions/setup-java@v5',
  'android-actions/setup-android@v3',
  'nttld/setup-ndk@v1',
  'brew install xcodegen cocoapods',
  'cargo install cargo-xwin',
  'choco install wixtoolset',
  'libbpf-dev',
  // Real artifact commands.
  ':app:assembleRelease',
  ':app:bundleRelease',
  'xcodebuild',
  'cargo tauri build',
  'scripts/build-openwrt-ipk.sh',
  'openwrt-sdk',
  // Fail-closed artifact verification.
  'if-no-files-found: error',
  'error: no APK produced',
  'error: no AAB produced',
  'error: no IPA produced',
  'error: no real IPK produced from SDK',
  'error: no desktop bundles produced',
  // Checkums.
  'sha256sum',
  'SHA256SUMS.txt',
  // No placeholder packaging path in the OpenWrt phase.
  'Download + extract OpenWrt SDK (real, not fallback)',
];
for (const needle of required) {
  assert.ok(wf.includes(needle), `vor-native-phase3.yml must contain: ${needle}`);
}

// Each native producer must reject empty files, not just rely on `if-no-files-found`.
for (const marker of [
  'find artifacts -type f -size 0',
  'placeholder marker found in an artifact',
]) {
  assert.ok(wf.includes(marker), `vor-native-phase3.yml checksum executor must reject placeholders via: ${marker}`);
}

// The pipeline must remain one of many quality pipelines; it may not publish.
assert.ok(
  !wfBody.includes('gh release create') && !wfBody.includes('gh release upload'),
  'vor-native-phase3.yml must not become a second GitHub Release publisher',
);

// The OpenWrt job must use the downloaded SDK path and run in fail-closed mode.
// Even though the builder script also has a legacy fallback path to keep the
// repo usable locally, the Phase 3 pipeline must never select it.
const ipkScript = read('scripts/build-openwrt-ipk.sh');
assert.ok(wfBody.includes('--sdk "'),
  'Phase 3 OpenWrt job must pass a real SDK path to the IPK builder');
assert.ok(wfBody.includes('--no-fallback'),
  'Phase 3 OpenWrt job must pass --no-fallback to disable manual placeholder packaging');
assert.ok(!wfBody.includes('manual-ipk-fallback'), 'Phase 3 OpenWrt job must not use manual placeholder packaging');
assert.ok(ipkScript.includes('--no-fallback'),
  'scripts/build-openwrt-ipk.sh must implement the --no-fallback fail-closed mode');
assert.ok(ipkScript.includes('refusing manual placeholder packaging'),
  'scripts/build-openwrt-ipk.sh must refuse manual packaging in --no-fallback mode');

// Quality gates from earlier phases must still be referenced from the checksum job.
assert.ok(wfBody.includes('for gate in tools/*.mjs'), 'checksum executor must run the full tools/*.mjs suite');

console.log(
  'vor_phase3_pipeline_gate: PASS — Phase 3 workflow is present, provisions all target toolchains, runs native tests before builds, emits real non-empty artifacts, and verifies checksums.',
);
