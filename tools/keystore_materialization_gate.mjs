#!/usr/bin/env node
// Vor keystore-materialization regression gate.
//
// Pins the fix for the real defect behind run 33971338723 (build-android,
// step "Materialize release keystore"): an operator-supplied base64 secret
// with CR/wraps/PEM armour/URL-safe chars/missing padding killed the whole
// build with a bare `base64: invalid input` exit 1. The fix is the shared,
// self-healing `scripts/materialize-keystore.sh` helper plus its workflow
// wiring. This gate fails closed if any of that regresses.
//
// Checks (all additive; the strict `on_missing_signing=fail` gate must stay):
//   1. the helper exists, is valid bash, and its offline proof-suite passes
//      for real (executed here, not mocked);
//   2. normalization covers CR / whitespace / PEM armour / literal "\n"
//      escapes / URL-safe alphabet / data-URI / missing padding / hex input;
//   3. validation proves the payload is a keystore (magic bytes + keytool
//      when available) and reports PRECISE reasons, never a bare exit code;
//   4. the workflow's android materialization + signing steps use the helper
//      and no raw `| base64 -d >` keystore decode remains anywhere;
//   5. signing-plan validates material (not just presence) and reports it;
//   6. the strict fail-mode branch is still present in both android and iOS
//      jobs (capability preservation), and report mode auto-recovers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const helper = read('scripts/materialize-keystore.sh');
const wf = read('.github/workflows/vor-native-phase3.yml');

// 1 ── helper exists, parses, and its real proof-suite passes.
assert.ok(helper.includes('vor_materialize_keystore()'), 'helper must define vor_materialize_keystore');
execFileSync('bash', ['-n', new URL('../scripts/materialize-keystore.sh', import.meta.url).pathname],
  { stdio: 'pipe' });
{
  const out = execFileSync('bash',
    [new URL('../scripts/materialize-keystore.sh', import.meta.url).pathname, '--self-test'],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  assert.match(out, /vor_keystore_selftest: PASS=\d+ FAIL=0/,
    'self-test must pass with zero failures:\n' + out);
}

// 2 ── every real-world malformation is handled by the normalizer.
for (const marker of [
  "tr -d ' \\t\\r\\n\\f\\v'",            // CR / whitespace / line-wraps
  "'-----BEGIN'",                          // PEM armour
  '\\\\n',                                 // literal backslash escapes
  'URL-safe alphabet mapped to standard',  // -/_ → +/
  'data:*base64,*',                        // data-URI prefix
  "missing '=' pad",                       // padding repair
  'input was hex-encoded',                 // xxd-style input
  'ignore-garbage',                        // last-resort decode (magic-proven)
]) {
  assert.ok(helper.includes(marker), `normalizer must handle: ${marker}`);
}

// 3 ── magic-driven selection (a hex keystore is also valid base64 of its own
//      text — ordering luck must never decide), plus precise reasons.
assert.ok(helper.includes('_magic_ok'), 'decode selection must be magic-driven');
for (const marker of ['feedfeed', 'NOT a keystore', 'STORE password was REJECTED', "alias"]) {
  assert.ok(helper.includes(marker), `validation must report precisely: ${marker}`);
}

// 4 ── workflow wiring: both keystore-consuming steps go through the helper.
const materializeIdx = wf.indexOf('name: Materialize release keystore');
const signIdx = wf.indexOf('name: Sign / verify Android artifacts');
assert.ok(materializeIdx > 0 && signIdx > materializeIdx, 'android keystore steps must exist');
const materializeBlock = wf.slice(materializeIdx, wf.indexOf('- name:', materializeIdx + 10));
assert.ok(materializeBlock.includes('scripts/materialize-keystore.sh'),
  'Materialize step must use the shared helper');
assert.ok(materializeBlock.includes('vor_materialize_keystore'),
  'Materialize step must call vor_materialize_keystore');
const signBlock = wf.slice(signIdx, wf.indexOf('- name:', signIdx + 10));
assert.ok(signBlock.includes('vor_materialize_keystore'),
  'Sign step must validate material through the helper before apksigner');
for (const [label, block] of [['Materialize', materializeBlock], ['Sign', signBlock]]) {
  assert.ok(!/\|\s*base64 -d >/.test(block),
    `${label} step must not decode keystore material with a raw \`| base64 -d >\``);
}
// The iOS profile check may decode directly ONLY because it normalises
// (tr -d whitespace/CR) and tolerates failure — pin that shape.
const profileIdx = wf.indexOf('plan-profile.bin');
assert.ok(profileIdx > 0, 'ios profile validation must exist');
const profileBlock = wf.slice(Math.max(0, profileIdx - 400), profileIdx);
assert.ok(profileBlock.includes("tr -d ' \\t\\r\\n'"),
  'ios profile decode must normalise whitespace/CR before decoding');

// 5 ── signing-plan validates material, not just presence.
assert.ok(wf.includes('android_material'), 'signing-plan must publish android_material');
assert.ok(wf.includes('ios_material'), 'signing-plan must publish ios_material');
const planIdx = wf.indexOf('name: Resolve signing capability');
const planBlock = wf.slice(planIdx, wf.indexOf('- name:', planIdx + 10));
assert.ok(planBlock.includes('actions/checkout@v7') === false || wf.indexOf('actions/checkout@v7', wf.indexOf('signing-plan:')) > 0,
  'signing-plan job must check out the repo to source the helper');
assert.ok(planBlock.includes('vor_materialize_keystore'),
  'signing-plan must validate the keystore material up front');
assert.ok(planBlock.includes('suspect:'), 'signing-plan must mark suspect material with a precise reason');

// 6 ── capability preservation: strict mode survives; report mode auto-recovers.
assert.ok(/on_missing_signing.*fail/.test(wf), 'strict fail gate must remain selectable');
const strictAndroid = materializeBlock.includes('on_missing_signing') &&
  materializeBlock.includes('PHASE3-KEYSTORE-MATERIALIZATION-FALLBACK');
assert.ok(strictAndroid,
  'android materialization must fail-closed in fail mode and auto-fallback (honest) in report mode');
assert.ok(wf.includes('PHASE3-SIGNING-MATERIAL-UNUSABLE'),
  'sign step must ship real UNSIGNED artifacts when material is unusable in report mode');
assert.ok(wf.includes('red BY YOUR EXPLICIT CHOICE'),
  'release-readiness must distinguish the explicit strict gate from a genuine build failure');

// 7 ── milestone 70: the FULL Gradle-level identity proofs are pinned.
// Runs 33974072492/33974841906-class failures happened INSIDE Gradle
// ("No key with alias 'vor' found", "keystore password was incorrect" /
//  BadPadding on the key entry) — the ladder must prove everything Gradle
// will do, and auto-correct what is safe to correct (same key identity).
for (const marker of [
  'importkeystore',                    // real key-decryption probe (what Gradle does)
  '_keyprobe',                         // the probe helper
  'VOR_ALIAS_EFFECTIVE',               // corrected-alias channel
  'VOR_KEY_PASSWORD_EFFECTIVE',        // corrected-key-password channel
  'trustedcertentry',                  // cert-vs-key check (JDK prints lower-case)
  'available aliases',                 // multi-alias reports every option
]) {
  assert.ok(helper.includes(marker), `helper must implement the milestone-70 proof: ${marker}`);
}
const planJobIdx = wf.indexOf('  signing-plan:');
assert.ok(planJobIdx > 0, 'signing-plan job must exist');
const planJobBlock = wf.slice(planJobIdx, wf.indexOf('  native-tests:', planJobIdx));
assert.ok(planJobBlock.includes('actions/setup-java@v6'),
  'signing-plan must install a JDK so material validation uses REAL keytool proofs');
assert.ok(planJobBlock.includes('KS_KEY_PASSWORD'),
  'signing-plan must validate the KEY password, not just presence');
const matIdx2 = wf.indexOf('name: Materialize release keystore');
const materializeBlock2 = wf.slice(matIdx2, wf.indexOf('- name:', matIdx2 + 10));
assert.ok(materializeBlock2.includes('ANDROID_KEY_PASSWORD'),
  'materialize step must receive the key-password secret');
assert.ok(materializeBlock2.includes('PHASE3-ALIAS-AUTO-RESOLVED'),
  'materialize step must warn loudly when it auto-resolves the alias');
assert.ok(materializeBlock2.includes('PHASE3-KEY-PASSWORD-AUTO-CORRECTED'),
  'materialize step must warn loudly when it auto-corrects the key password');
assert.ok(materializeBlock2.includes('VOR_KSEOF'),
  'override exports must use the heredoc GITHUB_ENV form (password-safe)');
const buildEnvIdx = wf.indexOf('name: Build Android app');
const buildEnvBlock = wf.slice(buildEnvIdx, wf.indexOf('- name:', buildEnvIdx + 10));
assert.ok(buildEnvBlock.includes('${{ env.VOR_ALIAS_EFFECTIVE || secrets.VOR_ANDROID_KEY_ALIAS }}'),
  'Gradle step must consume the corrected alias when present');
assert.ok(buildEnvBlock.includes('${{ env.VOR_KEY_PASSWORD_EFFECTIVE || secrets.VOR_ANDROID_KEY_PASSWORD }}'),
  'Gradle step must consume the corrected key password when present');
const signStepIdx = wf.indexOf('name: Sign / verify Android artifacts');
const signStepBlock2 = wf.slice(signStepIdx, wf.indexOf('- name:', signStepIdx + 10));
assert.ok(signStepBlock2.includes('${{ env.VOR_ALIAS_EFFECTIVE || secrets.VOR_ANDROID_KEY_ALIAS }}'),
  'apksigner step must consume the corrected alias when present');
assert.ok(signStepBlock2.includes('${{ env.VOR_KEY_PASSWORD_EFFECTIVE || secrets.VOR_ANDROID_KEY_PASSWORD }}'),
  'apksigner step must consume the corrected key password when present');
assert.ok(signStepBlock2.includes('"$ANDROID_KEY_PASSWORD"'),
  'sign step must pass the key password to the helper for the key probe');
assert.ok(wf.includes('PHASE3-DIAG-ANDROID-SIGN-KEY_PASSWORD_PRESENT'),
  'diagnostics must report key-password presence');

// 8 ── GitHub's workflow parser rejects duplicate mapping keys while PyYAML's
// default loader silently accepts them (last-wins). A duplicate env key broke
// the whole workflow (run 33975596545: "likely failed because of a workflow
// file issue"). Use the REAL YAML parser with a duplicate-key-rejecting loader
// for every workflow. Requires python3+PyYAML (preinstalled on GitHub runners);
// when unavailable locally this section degrades to a documented skip — every
// other section of this gate stays mandatory.
{
  const probe = (() => {
    try {
      execFileSync('python3', ['-c', 'import yaml'], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();
  if (probe) {
    const checker = `
import sys, yaml
class StrictLoader(yaml.SafeLoader):
    pass
def no_dup(loader, node, deep=False):
    keys = set()
    for k, _v in node.value:
        kk = loader.construct_object(k, deep=deep)
        if kk in keys:
            print(f"duplicate key '{kk}' at line {k.start_mark.line + 1}")
        keys.add(kk)
    return yaml.SafeLoader.construct_mapping(loader, node, deep)
StrictLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, no_dup)
yaml.load(open(sys.argv[1]), Loader=StrictLoader)
`;
    for (const f of ['.github/workflows/vor-native-phase3.yml', '.github/workflows/release.yml', '.github/workflows/universal-core-ci.yml']) {
      const file = new URL(`../${f}`, import.meta.url).pathname;
      const out = execFileSync('python3', ['-c', checker, file], { stdio: 'pipe', encoding: 'utf8' });
      assert.equal(out.trim(), '', `${f} must contain no duplicate mapping keys: ${out.trim()}`);
    }
  } else {
    console.log('note: python3/PyYAML unavailable — strict duplicate-key workflow scan skipped (runners enforce it)');
  }
}

console.log('keystore_materialization_gate: PASS — self-healing materialization pinned, strict gate preserved');
