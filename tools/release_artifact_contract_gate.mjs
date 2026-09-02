#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scriptPath = 'scripts/build-release-artifacts.sh';
const script = readFileSync(scriptPath, 'utf8');

for (const required of [
  'BASE_ANDROID_DIR=',
  'GUI_DIR=',
  'IOS_DIR=',
  'OPENWRT_PACKAGE_SCRIPT=',
  'ARTIFACT_DIR=',
  '--target all|android|ios|windows|linux|openwrt|dashboard|extensions',
  'release_artifact_contract: PASS',
  'never creates placeholder APK/IPA/EXE/IPK files',
  './gradlew :app:assembleRelease',
  'copy_matches "$ARTIFACT_DIR/android"',
  '*.apk',
  'xcodebuild -exportArchive',
  '*.ipa',
  'npm run build:windows',
  '*.exe',
  'npm run build:linux',
  '*.deb',
  '*.rpm',
  '*.AppImage',
  '"$OPENWRT_PACKAGE_SCRIPT" --out-dir "$ARTIFACT_DIR/openwrt"',
  '*unifiedshield*.ipk',
  'SHA256SUMS.txt',
  'require_tool wasm-pack extensions',
  'wasm-pack build --target web --out-dir pkg',
]) {
  assert.ok(script.includes(required), `${scriptPath} missing ${required}`);
}

for (const forbidden of [
  'touch "$ARTIFACT_DIR',
  'echo "placeholder"',
  'FAKE_',
]) {
  assert.ok(!script.includes(forbidden), `${scriptPath} contains fake artifact marker: ${forbidden}`);
}


const extensionBuilderPath = 'MICAFP/extensions/scripts/build-extension.mjs';
const extensionBuilder = readFileSync(extensionBuilderPath, 'utf8');
assert.ok(extensionBuilder.includes('modernChromeBackground = "chrome/background/service-worker.js"'), `${extensionBuilderPath}: active Chrome background must use hardened service worker`);
assert.ok(extensionBuilder.includes('modernFirefoxBackground = "firefox/background/background.js"'), `${extensionBuilderPath}: active Firefox background must use hardened background worker`);
assert.ok(extensionBuilder.includes('const defaultPopup = hasModernPopup ? "popup/popup.html" : "popup.html"'), `${extensionBuilderPath}: active popup must prefer modern V2RayEZ popup`);
assert.ok(extensionBuilder.includes('runTypeScriptEmit()'), `${extensionBuilderPath}: explicit TypeScript emit helper missing`);
assert.ok(extensionBuilder.includes('node_modules'), `${extensionBuilderPath}: local TypeScript compiler path missing`);
assert.ok(extensionBuilder.includes('shield_obfuscator_bg.wasm'), `${extensionBuilderPath}: wasm-pack output artifact candidate missing`);
assert.ok(readFileSync('MICAFP/extensions/chrome/manifest.json', 'utf8').includes('"alarms"'), 'Chrome extension manifest must declare alarms permission for active service worker');
assert.ok(readFileSync('MICAFP/extensions/firefox/manifest.json', 'utf8').includes('"alarms"'), 'Firefox extension manifest must declare alarms permission for active background worker');
assert.ok(extensionBuilder.includes('V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM'), `${extensionBuilderPath}: development-only WASM override missing`);
assert.ok(extensionBuilder.includes('throw new Error('), `${extensionBuilderPath}: missing fail-closed WASM artifact error`);
assert.ok(extensionBuilder.includes('release artifact builds do not set'), `${extensionBuilderPath}: WASM placeholder must be documented as non-release only`);
assert.ok(!/writeFileSync\(wasmDestination, Buffer\.from\([^;]+\);\s*console\.warn\("Real WASM obfuscator artifact is missing/s.test(extensionBuilder), `${extensionBuilderPath}: unconditional empty WASM placeholder found`);

const workflowPath = 'docs/ci/github-workflows/universal-source-gates.yml.sample';
const workflow = readFileSync(workflowPath, 'utf8');
assert.ok(workflow.includes('node tools/release_artifact_contract_gate.mjs'), `${workflowPath}: release artifact contract gate missing`);
assert.ok(workflow.includes('scripts/build-release-artifacts.sh --check'), `${workflowPath}: release artifact --check missing`);

console.log('release_artifact_contract_gate: PASS');
