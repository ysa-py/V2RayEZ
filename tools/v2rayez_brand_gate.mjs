#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

function text(path) {
  return readFileSync(path, 'utf8');
}

function mustExist(path, minBytes = 32) {
  assert.ok(existsSync(path), `missing brand asset: ${path}`);
  assert.ok(statSync(path).size >= minBytes, `${path} is too small to be a real logo`);
}

const android = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';
const svg = text('brand/v2rayez-logo.svg');
const tauriSvg = text('V2RayEZ-GUI/src-tauri/icons/icon.svg');
const guiSvg = text('V2RayEZ-GUI/src/v2rayez-logo.svg');
const dashboardSvg = text('MICAFP/dashboard/public/logo.svg');

for (const body of [svg, tauriSvg, guiSvg, dashboardSvg]) {
  assert.match(body, /aria-label="V2RayEZ"/);
  assert.match(body, /vFill|linearGradient id="vFill"/);
  assert.doesNotMatch(body, /M149 343 241 145/);
  assert.doesNotMatch(body, /AetherGUI|Aethon|Firstham/i);
}

mustExist('brand/v2rayez-enterprise-icon.png', 20_000);
mustExist('brand/v2rayez-enterprise-icon-fullbleed.png', 20_000);
mustExist('V2RayEZ-GUI/src-tauri/icons/icon.png', 8_000);
mustExist('V2RayEZ-GUI/src-tauri/icons/icon.ico', 8_000);
mustExist(`${android}/app/src/main/res/drawable-nodpi/ic_launcher_art.png`, 8_000);
mustExist('scripts/rasterize-brand-icons.sh');

const launcher = text(`${android}/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`);
assert.match(launcher, /ic_launcher_art/);
assert.match(text('V2RayEZ-GUI/src/styles.css'), /v2rayez-logo\.svg/);
assert.match(text('V2RayEZ-GUI/src/index.html'), /brand-mark/);
assert.match(
  text(`${android}/app/src/main/java/com/v2rayez/app/ui/screens/home/HomeScreen.kt`),
  /R\.drawable\.ic_logo_v/
);
assert.match(
  text(`${android}/app/src/main/java/com/v2rayez/app/data/repository/RealVpnController.kt`),
  /SmartRepairPlanner\.plan/
);

const rasterize = text('scripts/rasterize-brand-icons.sh');
assert.match(rasterize, /Donor project logos are intentionally left untouched/);
assert.doesNotMatch(rasterize, /rm -rf .*EasySNI|rm -rf .*MICAFP|rm -rf .*MSN-GUARD/);

console.log('v2rayez_brand_gate: PASS — enterprise V mark is canonical and donor logos were not deleted.');
