#!/usr/bin/env node
/**
 * ffi_jni_consistency_gate — fail-closed verification of the V2RayEZ native
 * boundary. Runs in CI alongside the other tools/*.mjs gates.
 *
 * What it checks (all automatically, zero manual review needed):
 *   1. Every `native` method declared in NativeBridge.java has a matching
 *      JNI C implementation with the exact symbol name AND argument arity.
 *   2. Every JNI C implementation maps back to a declared Java native
 *      (no orphan JNI symbols).
 *   3. Java ↔ JNI type mapping is correct (long↔jlong, String↔jstring,
 *      void↔void).
 *   4. Every core symbol called from the JNI C bridge is declared in BOTH
 *      v2rayez_core.h (C header) and exported from Rust ffi.rs (#[no_mangle]).
 *   5. Every JSON literal embedded in the Rust FFI boundary is well-formed.
 *   6. The status JSON contract carries `status` + `shutdown_requested` in
 *      every branch (active and shutting_down).
 *   7. Naming is unified: Gradle namespace/applicationId, Java package, JNI
 *      symbol prefix, and AndroidManifest all agree on com.v2rayez.core, and
 *      the shipped library name is libv2rayez_core.so everywhere.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(ROOT, 'universal-core', 'android');

const errors = [];
const passes = [];

function check(ok, passMsg, failMsg) {
  if (ok) passes.push(passMsg);
  else errors.push(failMsg);
}

function read(p) {
  return readFileSync(p, 'utf8');
}

// ────────────────────────────────────────────────────────────────────────────
// Inputs
// ────────────────────────────────────────────────────────────────────────────
const nativeBridgeJava = read(join(ANDROID, 'app', 'src', 'main', 'java', 'com', 'v2rayez', 'core', 'NativeBridge.java'));
const jniC = read(join(ANDROID, 'jni', 'v2rayez_core_jni.c'));
const coreH = read(join(ANDROID, 'jni', 'v2rayez_core.h'));
const ffiRs = read(join(ROOT, 'universal-core', 'src', 'ffi.rs'));
const appGradle = read(join(ANDROID, 'app', 'build.gradle'));
const manifest = read(join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml'));

// ────────────────────────────────────────────────────────────────────────────
// 1. Java native declarations
// ────────────────────────────────────────────────────────────────────────────
const javaNatives = [...nativeBridgeJava.matchAll(
  /public\s+native\s+([\w[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*;/g,
)].map(([, ret, name, params]) => ({
  ret,
  name,
  args: params.split(',').map((p) => p.trim()).filter(Boolean).map((p) => p.split(/\s+/)[0]),
}));

check(javaNatives.length >= 5, `NativeBridge declares ${javaNatives.length} native methods`, 'NativeBridge.java: expected at least 5 native methods');

const javaByName = new Map(javaNatives.map((m) => [m.name, m]));

// The loadLibrary target defines the shipped .so name.
const loadLib = nativeBridgeJava.match(/System\.loadLibrary\("([^"]+)"\)/);
check(loadLib && loadLib[1] === 'v2rayez_core', 'NativeBridge loads libv2rayez_core.so', `NativeBridge.java: unexpected loadLibrary target: ${loadLib ? loadLib[1] : '<missing>'}`);

// ────────────────────────────────────────────────────────────────────────────
// 2. JNI C implementations
// ────────────────────────────────────────────────────────────────────────────
const JNI_PREFIX = 'Java_com_v2rayez_core_NativeBridge_';
const jniImpls = [...jniC.matchAll(
  /JNIEXPORT\s+(\w+)\s+JNICALL\s*\n(Java_com_v2rayez_core_NativeBridge_\w+)\s*\(([^)]*)\)/g,
)].map(([, ret, symbol, params]) => ({
  ret,
  symbol,
  name: symbol.slice(JNI_PREFIX.length),
  params: params.split(',').map((p) => p.trim()).filter(Boolean).map((p) => p.split(/\s+/).slice(-2).join(' ')),
}));

check(jniImpls.length >= 5, `JNI bridge implements ${jniImpls.length} symbols`, 'v2rayez_core_jni.c: expected at least 5 JNI implementations');

// All JNI symbols must use the unified package prefix (naming consistency).
for (const impl of jniImpls) {
  check(impl.symbol.startsWith(JNI_PREFIX), `JNI symbol ${impl.symbol} uses com.v2rayez.core prefix`, `JNI symbol ${impl.symbol} does not match package com.v2rayez.core`);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Java ↔ JNI bidirectional match + type mapping
// ────────────────────────────────────────────────────────────────────────────
const J2C_RET = { long: 'jlong', void: 'void', String: 'jstring', int: 'jint', boolean: 'jboolean' };
const J2C_ARG = { long: 'jlong', String: 'jstring', int: 'jint', boolean: 'jboolean' };

for (const m of javaNatives) {
  const impl = jniImpls.find((i) => i.name === m.name);
  if (!impl) {
    errors.push(`native ${m.name}() has no JNI implementation (UnsatisfiedLinkError at runtime)`);
    continue;
  }
  // Arity: JNIEnv* + jobject receiver + one param per Java arg.
  const expected = 2 + m.args.length;
  check(impl.params.length === expected,
    `JNI arity for ${m.name}: ${impl.params.length} params == 2 + ${m.args.length}`,
    `JNI arity mismatch for ${m.name}: C has ${impl.params.length} params, expected ${expected}`);
  // Return type mapping.
  const expectedRet = J2C_RET[m.ret] ?? m.ret;
  check(impl.ret === expectedRet,
    `return type ${m.name}: ${m.ret} -> ${impl.ret}`,
    `return type mismatch for ${m.name}: Java ${m.ret} vs C ${impl.ret} (expected ${expectedRet})`);
  // Argument type mapping (skip JNIEnv*/jobject).
  m.args.forEach((javaType, idx) => {
    const cParam = impl.params[2 + idx] ?? '<missing>';
    const cType = cParam.split(/\s+/)[0].replace(/^\*/, '');
    const expectedArg = J2C_ARG[javaType] ?? javaType;
    check(cType === expectedArg,
      `${m.name} arg#${idx}: ${javaType} -> ${cType}`,
      `arg type mismatch for ${m.name} arg#${idx}: Java ${javaType} vs C ${cType} (expected ${expectedArg})`);
  });
}

for (const impl of jniImpls) {
  check(javaByName.has(impl.name),
    `JNI symbol ${impl.name} maps to a declared Java native`,
    `orphan JNI symbol ${impl.symbol}: no matching native declaration in NativeBridge.java`);
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Core symbols: C bridge → header → Rust FFI exports
// ────────────────────────────────────────────────────────────────────────────
const CORE_SYMBOLS = [...new Set([...jniC.matchAll(/\bv2rayez_(core|license|free)_\w+/g)].map((m) => m[0]))];
const headerSymbols = [...coreH.matchAll(/\b(v2rayez_\w+)\s*\(/g)].map((m) => m[1]);
const rustExports = [...ffiRs.matchAll(/#\[no_mangle\]\s*\npub\s+extern\s+"C"\s+fn\s+(\w+)/g)].map((m) => m[1]);

check(CORE_SYMBOLS.length >= 6, `JNI bridge calls ${CORE_SYMBOLS.length} core symbols`, 'JNI bridge: expected at least 6 v2rayez_* core symbol references');

for (const sym of CORE_SYMBOLS) {
  check(headerSymbols.includes(sym), `header declares ${sym}`, `v2rayez_core.h is missing declaration for ${sym}`);
  check(rustExports.includes(sym), `Rust FFI exports ${sym}`, `ffi.rs is missing #[no_mangle] export for ${sym}`);
}

// Rust must not export core symbols the header does not expose.
for (const sym of rustExports) {
  check(headerSymbols.includes(sym), `export ${sym} is covered by the C header`, `ffi.rs exports ${sym} but v2rayez_core.h does not declare it`);
}

// All four platform header copies must declare the same ABI as the canonical
// Android JNI header (drift = silent breakage of iOS/Linux/Windows/OpenWrt).
const PLATFORM_HEADERS = [
  'universal-core/apple/include/v2rayez_core.h',
  'universal-core/linux/v2rayez_core.h',
  'universal-core/windows/include/v2rayez_core.h',
];
for (const rel of PLATFORM_HEADERS) {
  const text = read(join(ROOT, ...rel.split('/')));
  const symbols = [...text.matchAll(/\b(v2rayez_\w+)\s*\(/g)].map((m) => m[1]).sort();
  const canonical = [...headerSymbols].sort();
  check(JSON.stringify(symbols) === JSON.stringify(canonical),
    `${rel} matches the canonical ABI (${symbols.length} symbols)`,
    `${rel} ABI drift: [${symbols.join(', ')}] vs canonical [${canonical.join(', ')}]`);
}

// ────────────────────────────────────────────────────────────────────────────
// 5. JSON literals inside the Rust FFI boundary are well-formed
// ────────────────────────────────────────────────────────────────────────────
// Skip format!() templates (they use doubled braces / placeholders, e.g. `{{"allowed":true,...,{}}}`).
const rustJsonLiterals = [...ffiRs.matchAll(/r#"([\s\S]*?)"#/g)]
  .map((m) => m[1])
  .filter((s) => s.trimStart().startsWith('{'))
  .filter((s) => !s.includes('{{'));
check(rustJsonLiterals.length >= 5, `found ${rustJsonLiterals.length} JSON literals in ffi.rs`, 'ffi.rs: expected at least 5 JSON response literals');
for (const literal of rustJsonLiterals) {
  try {
    JSON.parse(literal);
    passes.push(`ffi.rs JSON literal OK: ${literal.slice(0, 48)}${literal.length > 48 ? '…' : ''}`);
  } catch (err) {
    errors.push(`ffi.rs JSON literal is INVALID (${err.message}): ${literal}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Status contract: every branch reports status + shutdown_requested
// ────────────────────────────────────────────────────────────────────────────
const statusBranches = rustJsonLiterals.filter((l) => l.includes('"status"'));
check(statusBranches.length >= 2, `status contract has ${statusBranches.length} branches`, 'ffi.rs: expected at least 2 status JSON branches');
for (const branch of statusBranches) {
  check(branch.includes('"shutdown_requested"'),
    `status branch carries shutdown_requested (${branch.includes('"shutdown_requested":true') ? 'true' : 'false'})`,
    `status JSON branch missing shutdown_requested key: ${branch}`);
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Naming unification across Gradle / manifest / sources
// ────────────────────────────────────────────────────────────────────────────
const namespace = appGradle.match(/namespace\s+'([^']+)'/);
const appId = appGradle.match(/applicationId\s+"([^"]+)"/);
check(namespace && namespace[1] === 'com.v2rayez.core', `Gradle namespace = com.v2rayez.core`, `Gradle namespace mismatch: ${namespace ? namespace[1] : '<missing>'}`);
check(appId && appId[1] === 'com.v2rayez.core', `applicationId = com.v2rayez.core`, `applicationId mismatch: ${appId ? appId[1] : '<missing>'}`);
check(!/package\s*=/.test(manifest), 'manifest has no deprecated package attribute (AGP 8+ warning-free)', 'AndroidManifest.xml still sets the deprecated package attribute');
check(nativeBridgeJava.includes('package com.v2rayez.core;'), 'NativeBridge package = com.v2rayez.core', 'NativeBridge.java package does not match com.v2rayez.core');

const abiFilters = appGradle.match(/abiFilters\s+([^\n]+)/);
check(abiFilters && ['arm64-v8a', 'armeabi-v7a', 'x86_64'].every((abi) => abiFilters[1].includes(abi)),
  'abiFilters package arm64-v8a + armeabi-v7a + x86_64',
  `abiFilters missing an ABI: ${abiFilters ? abiFilters[1] : '<missing>'}`);

// ────────────────────────────────────────────────────────────────────────────
// Result
// ────────────────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`ffi_jni_consistency_gate: FAIL — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`ffi_jni_consistency_gate: PASS — ${passes.length} checks verified across Rust FFI / C header / JNI bridge / Java / Gradle.`);
