#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const runtimeRoots = [
  'V2RayEZ-GUI/src',
  'V2RayEZ-GUI/src-tauri/src',
  'V2RayEZ-GUI/android/app/src/main',
  'MICAFP/dashboard/src',
  'MICAFP/extensions/chrome',
  'MICAFP/extensions/firefox',
  'MICAFP/extensions/shared',
  'MICAFP/ios/UnifiedShield/App',
  'MICAFP/ios/UnifiedShield/NetworkExtension',
];

const forbidden = [
  /AetherGUI/i,
  /Aether\s+GUI/i,
  /Aethon/i,
  /Firstham/i,
  /com\.firstham/i,
  /@hamvex/i,
];

const ignoredDirs = new Set([
  '.git',
  '.next',
  'dist',
  'node_modules',
  'target',
  'build',
  '.gradle',
]);

const ignoredExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.icns',
  '.jar',
  '.wasm',
  '.lock',
]);

let failures = 0;
for (const root of runtimeRoots) {
  scan(root);
}


const openwrtLuciUiFiles = [
  'MICAFP/openwrt/src/luci-app-unifiedshield/Makefile',
  'MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/controller/unifiedshield.lua',
  'MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield.lua',
  'MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua',
  'MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/unifiedshield.lua',
];

const openwrtVisibleForbidden = [
  /LUCI_TITLE:=.*UnifiedShield/,
  /_\([^\n]*UnifiedShield/,
  /translate\([^\n]*UnifiedShield/,
  /message\s*=.*UnifiedShield/,
  /translate\([^\n]*Aether/i,
  /_\([^\n]*Aether/i,
];

for (const file of openwrtLuciUiFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of openwrtVisibleForbidden) {
      if (pattern.test(line)) {
        failures += 1;
        console.error(`${file}:${index + 1}: forbidden OpenWrt visible donor identity: ${line.trim()}`);
      }
    }
  });
}

if (failures > 0) {
  console.error(`V2RayEZ identity gate failed: ${failures} forbidden legacy GUI reference(s) found.`);
  process.exit(1);
}
console.log('v2rayez_identity_gate: PASS — runtime UI surfaces keep V2RayEZ identity and do not expose forbidden donor GUI identity.');

function scan(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    const name = path.split(/[\\/]/).pop();
    if (ignoredDirs.has(name)) return;
    for (const entry of readdirSync(path)) scan(join(path, entry));
    return;
  }
  if (!stat.isFile()) return;
  if (ignoredExtensions.has(extension(path))) return;

  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of forbidden) {
      if (pattern.test(line)) {
        failures += 1;
        console.error(`${relative(process.cwd(), path)}:${index + 1}: forbidden legacy GUI identity: ${line.trim()}`);
      }
    }
  });
}

function extension(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}
