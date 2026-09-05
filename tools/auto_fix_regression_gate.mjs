#!/usr/bin/env node
// Auto-fix regression gate.
//
// Locked-in contract:
//   1. `scripts/auto-fix.mjs` exists and supports a fail-closed `--check` mode;
//   2. running it over the tree produces ZERO blocking findings, i.e. none of
//      the defect classes that have already broken CI may reappear:
//        * xcodebuild options passed as a single quoted argv entry;
//        * a non-Mach-O file packaged as an .ipa executable;
//        * a hard-coded Xcode project name that contradicts project.yml;
//        * a diagnostics step whose log can be missing on the failure path;
//        * a non-RGBA Tauri icon (generate_context! panics with "is not RGBA");
//        * a truncated Go pseudo-version;
//        * trailing whitespace / tab indentation in repo-owned YAML;
//        * a shell script under scripts/ or universal-core/ that fails `bash -n`;
//   3. CI actually runs the checker, so the contract is enforced on every push;
//   4. the iOS packaging helper stays fail-closed (it must never synthesise an
//      app executable) and the Phase 3 pipeline stays signing-plan driven
//      (a missing credential is reported, never dressed up as a build error).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const tool = 'scripts/auto-fix.mjs';
assert.ok(existsSync(join(ROOT, tool)), `${tool} must exist`);
const toolBody = read(tool);
for (const needle of ['--check', 'MODE', 'blocking()']) {
  assert.ok(toolBody.includes(needle), `${tool} must implement a fail-closed --check mode (missing: ${needle})`);
}

let out = '';
let code = 0;
try {
  out = execFileSync('node', [join(ROOT, tool), '--check'], { encoding: 'utf8', stdio: 'pipe' });
} catch (err) {
  out = `${err.stdout || ''}${err.stderr || ''}`;
  code = err.status ?? 1;
}
assert.equal(code, 0, `scripts/auto-fix.mjs --check reported blocking findings:\n${out}`);
assert.ok(/PASS/.test(out), `scripts/auto-fix.mjs --check must report a PASS line, got:\n${out}`);

// CI wiring: the checker must run inside the Phase 3 native test stage.
const wf = read('.github/workflows/vor-native-phase3.yml');
assert.ok(
  wf.includes('node scripts/auto-fix.mjs --check'),
  'vor-native-phase3.yml must run `node scripts/auto-fix.mjs --check` so the contract is enforced in CI',
);

// iOS packaging must stay honest: no synthesized executable, real verification.
const helper = read('scripts/ios-packaging.sh');
for (const needle of ['ios_verify_ipa', 'ios_verify_app_bundle', 'ios_is_macho', 'ios_resolve_xcodeproj']) {
  assert.ok(helper.includes(needle), `scripts/ios-packaging.sh must provide ${needle}()`);
}
assert.ok(
  !/echo\s+"?#!\/bin\/sh/.test(helper),
  'scripts/ios-packaging.sh must never synthesise a shell-script app executable',
);
for (const entry of ['scripts/build-ios-ipa.sh', 'universal-core/apple/build-ipa.sh']) {
  const body = read(entry);
  assert.ok(
    !/echo\s+"?#!\/bin\/sh/.test(body),
    `${entry} must not package a non-Mach-O executable as an .ipa`,
  );
  assert.ok(body.includes('ios-packaging.sh'), `${entry} must use the shared fail-closed iOS packaging helper`);
}

// The pipeline must stay signing-plan driven.
for (const needle of [
  'signing-plan:',
  'needs.signing-plan.outputs.android',
  'needs.signing-plan.outputs.ios',
  'PHASE3-SIGNING-BLOCKED-ANDROID',
  'PHASE3-SIGNING-BLOCKED-IOS',
  'release-readiness:',
]) {
  assert.ok(wf.includes(needle), `vor-native-phase3.yml must contain: ${needle}`);
}
// The original xcodebuild argv defect must stay fixed (comment lines, which
// document the defect, are not executable YAML).
const wfCode = wf
  .split(/\r?\n/)
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');
assert.ok(
  !/xcodebuild\s+"\$OPTS"/.test(wfCode),
  'xcodebuild must not receive its options as a single quoted argv entry',
);

console.log(
  'auto_fix_regression_gate: PASS — auto-fix checker is clean, wired into CI, iOS packaging is fail-closed, and the pipeline is signing-plan driven.',
);
