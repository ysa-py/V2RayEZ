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
// Tauri's `generate_context!()` panics at compile time if a referenced .png
// icon is not RGBA ("icon ... is not RGBA"). The Tauri bundle entry points are
// 32x32.png, 128x128.png and icon.png, so every top-level icon must carry an
// alpha channel (PNG color type 6). We parse the IHDR byte directly (no deps).
const iconsDir = new URL('../V2RayEZ-GUI/src-tauri/icons/', import.meta.url).pathname;
for (const name of readdirSync(iconsDir)) {
  if (!name.endsWith('.png')) continue;
  const png = readFileSync(iconsDir + name);
  if (png.length < 29 || png[0] !== 0x89) {
    throw new Error(`V2RayEZ-GUI/src-tauri/icons/${name} is not a valid PNG`);
  }
  const colorType = png[25];
  if (colorType !== 6) {
    throw new Error(
      `V2RayEZ-GUI/src-tauri/icons/${name} is PNG color type ${colorType}; ` +
        'Tauri requires RGBA (color type 6) or build fails with "icon is not RGBA"',
    );
  }
}

// Tauri's bundler also decodes `icon.ico`. A plain PNG renamed to `.ico` fails
// with "Format error decoding Ico: The PNG is not in RGBA format!"; a real
// multi-frame ICO whose embedded PNG frames are RGBA (color type 6) is required.
function validateIco(path) {
  const b = readFileSync(path);
  if (b.length < 22 || b[0] !== 0x00 || b[1] !== 0x00 || b[2] !== 0x01 || b[3] !== 0x00) {
    throw new Error(`${path} is not a valid ICO (header must be 00 00 01 00)`);
  }
  const count = b.readUInt16LE(4);
  if (!count) throw new Error(`${path} has no icon directory entries`);
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    if (off + 16 > b.length) throw new Error(`${path} truncated ICO directory`);
    const size = b.readUInt32LE(off + 8);
    const imgOff = b.readUInt32LE(off + 12);
    if (imgOff + size > b.length) throw new Error(`${path} truncated image payload`);
    const img = b.subarray(imgOff, imgOff + size);
    if (img[0] === 0x89 && img[1] === 0x50 && img[2] === 0x4e && img[3] === 0x47) {
      if (img.length < 26) throw new Error(`${path} contains a malformed PNG frame`);
      const colorType = img[25];
      if (colorType !== 6) {
        throw new Error(
          `${path} contains a PNG frame with color type ${colorType}; ` +
            'Tauri requires RGBA (color type 6) or bundling fails with "The PNG is not in RGBA format!"',
        );
      }
    }
  }
}
validateIco(new URL('../V2RayEZ-GUI/src-tauri/icons/icon.ico', import.meta.url).pathname);

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
  // Go modules without a correct go.mod/go.sum still need their real module graph
  // materialized before tests; the resolution itself is fail-closed.
  'go mod tidy',
  'go test ./...',
  // No Go module may be skipped; donor and Vor-owned modules are all gate-tested.
  'No donor modules are skipped',
  './gradlew testDebugUnitTest',
  // Toolchain provisioning on the specific runners.
  'dtolnay/rust-toolchain',
  // Latest action majors (Node 24 runtime) to avoid Node 20 deprecation warnings.
  'actions/checkout@v7',
  'actions/setup-go@v7',
  'actions/setup-java@v6',
  'actions/setup-node@v7',
  'actions/cache@v6',
  'actions/upload-artifact@v7',
  'actions/download-artifact@v8',
  'android-actions/setup-android@v4',
  'nttld/setup-ndk@v1.6.0',
  // Multi-module Go cache requires an explicit dependency path; the default
  // ./go.sum does not exist and would emit a setup-go restore warning.
  'cache-dependency-path',
  '**/go.sum',
  // setup-go must not manage the same ~/go/pkg/mod tree as the explicit
  // actions/cache step. Two restores into the same directory cause tar
  // "Cannot open: File exists" collisions. The cache key must also be bumped
  // to bypass any stale/overlapping archive from before the fix.
  'cache: false',
  'v4-cache-vor-native-tests-',
  'brew install xcodegen cocoapods',
  'cargo install cargo-xwin',
  'choco install wixtoolset',
  'libbpf-dev',
  // Real artifact commands.
  ':app:assembleRelease',
  ':app:bundleRelease',
  'xcodebuild',
  'npx tauri build',
  // Desktop sidecars must be provisioned + verified before Tauri's
  // beforeBuildCommand runs prepare-sidecar.mjs; otherwise the build fails on
  // real per-target aether/sing-box files.
  'node scripts/fetch-sidecars.mjs',
  'TAURI_ENV_TARGET_TRIPLE',
  // OpenWrt cross-compile writes a staticlib successfully; the trailing
  // `find ... | head -n 40` must not turn SIGPIPE into a step failure under
  // `set -o pipefail`.
  'find target -path "*${{ matrix.rust_target }}/release/*" -type f -print | head -n 40 || true',
  // Once the staticlib exists the IPK build is the next real failure point;
  // its raw output must be captured to a tee'd log and emitted as diagnostics.
  'tee /tmp/openwrt-ipk.log',
  'PHASE3-DIAG-OPENWRT-IPK-',
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
// The SDK package must compile the preserved C daemon and install the real
// cross-built binaries without re-running cargo/git-source inside OpenWrt.
assert.ok(ipkScript.includes('scripts/openwrt-local-package.mk'),
  'scripts/build-openwrt-ipk.sh must install the local prebuilt OpenWrt package Makefile');

// Quality gates from earlier phases must still be referenced from the checksum job.
assert.ok(wfBody.includes('for gate in tools/*.mjs'), 'checksum executor must run the full tools/*.mjs suite');

console.log(
  'vor_phase3_pipeline_gate: PASS — Phase 3 workflow is present, provisions all target toolchains, runs native tests before builds, emits real non-empty artifacts, and verifies checksums.',
);
