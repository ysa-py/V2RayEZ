#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const makefilePath = 'MICAFP/openwrt/Makefile';
const makefile = readFileSync(makefilePath, 'utf8');
const version = makefile.match(/^PKG_SOURCE_VERSION:=([^\n]+)$/m)?.[1]?.trim();
assert.match(version || '', /^[0-9a-f]{40}$/, `${makefilePath}: PKG_SOURCE_VERSION must be a pinned 40-character commit SHA`);
assert.notEqual(version, 'arena/01a05e13-v2rayez', `${makefilePath}: package source must not point at a moving branch`);
assert.ok(makefile.includes('license-watchdog.sh $(1)/usr/libexec/unifiedshield/license-watchdog.sh'), `${makefilePath}: runtime license watchdog must be installed`);

const scriptPath = 'MICAFP/scripts/package-openwrt.sh';
const script = readFileSync(scriptPath, 'utf8');
for (const required of [
  'OPENWRT_SDK',
  '--sdk',
  '--out-dir',
  '--check',
  'validate_package_tree',
  'PKG_SOURCE_VERSION must be a pinned 40-character commit SHA',
  'does not look like an OpenWrt SDK root',
  'package/network/services/unifiedshield',
  'make -C "$SDK_DIR" defconfig',
  'make -C "$SDK_DIR" package/unifiedshield/compile V=s -j"$JOBS"',
  "find \"$SDK_DIR/bin\" -type f -name '*unifiedshield*.ipk'",
  'sha256sum ./*unifiedshield*.ipk > SHA256SUMS',
]) {
  assert.ok(script.includes(required), `${scriptPath} missing ${required}`);
}
assert.ok(!script.includes('cargo build --release --target ${arch}-unknown-linux-musl'), `${scriptPath}: old non-SDK packaging loop remains`);

console.log('openwrt_packaging_gate: PASS');
