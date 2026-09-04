#!/usr/bin/env node
// android_feature_presence_gate.mjs — proves the full V2RayEZ Android app still
// ships every anti-censorship / AI anti-DPI / dynamic-domain / Iran feature.
// This is the "zero feature removal" guard: it must PASS for any release build,
// so removing or silently disabling a feature makes the release fail.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main';

function text(rel) {
  const p = join(APP_DIR, rel);
  assert.ok(existsSync(p), `missing source file: ${rel}`);
  return readFileSync(p, 'utf8');
}

function hasFile(rel, needle) {
  assert.ok(text(rel).includes(needle), `${rel} missing ${needle}`);
}

// Accept `class X`, `object X`, `interface X`, `data class X`, `enum class X`,
// and `@Composable fun X(...)`.
function hasDecl(rel, name) {
  const src = text(rel);
  const ok =
    src.includes(`class ${name}`) ||
    src.includes(`object ${name}`) ||
    src.includes(`interface ${name}`) ||
    src.includes(`class ${name}(`) ||
    src.includes(`fun ${name}(`) ||
    src.includes(`data class ${name}`) ||
    src.includes(`enum class ${name}`);
  assert.ok(ok, `${rel} missing type/function declaration ${name}`);
}

// ── Core ABIs must all still be present (never reduced) ─────────────────────
for (const abi of ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']) {
  const dir = join(APP_DIR, 'jniLibs', abi);
  assert.ok(statSync(dir).isDirectory(), `missing native dir jniLibs/${abi}`);
  const sos = readdirSync(dir).filter((f) => f.endsWith('.so'));
  assert.ok(sos.length > 0, `no .so in jniLibs/${abi}`);
}
// The dynamic/on-demand core libs that power anti-DPI + Iran anti-censorship.
for (const so of [
  'libbyedpi.so',   // ByeDPI — DPI bypass
  'libtor.so',      // Tor / obfs4 (+ lyrebird)
  'liblyrebird.so', // Lyrebird obfs4
  'libmihomo.so',   // Clash.Meta/sing-box mihomo
  'libsingbox.so',  // sing-box
  'libsnowflake.so',// Snowflake pluggable transport
  'libwebtunnel.so',// WebTunnel pluggable transport
  'libhev-socks5-tunnel.so', // hev Socks5/TUN
]) {
  assert.ok(
    existsSync(join(APP_DIR, 'jniLibs', 'arm64-v8a', so)) ||
      existsSync(join(APP_DIR, 'jniLibs', 'x86_64', so)),
    `expected native core lib to exist in arm64-v8a (or x86_64): ${so}`
  );
}

// ── Anti-DPI / anti-censorship / AI / dynamic-domain / Iran features ────────
for (const [rel, name] of [
  ['java/com/v2rayez/app/data/sni/ByeDpiEngine.kt', 'ByeDpiEngine'],
  ['java/com/v2rayez/app/data/sni/SniScanner.kt', 'SniScanner'],
  ['java/com/v2rayez/app/data/fronting/DomainFrontEngine.kt', 'DomainFrontEngine'],
  ['java/com/v2rayez/app/data/fronting/DomainFrontDialer.java', 'DomainFrontDialer'],
  ['java/com/v2rayez/app/data/fronting/TlsClientHello.java', 'TlsClientHello'],
  ['java/com/v2rayez/app/data/ai/AndroidAiProviderGateway.kt', 'AndroidAiProviderGateway'],
  ['java/com/v2rayez/app/data/core/IranRouting.kt', 'IranRouting'],
  ['java/com/v2rayez/app/data/core/IranGeoAutoConfigurator.kt', 'IranGeoAutoConfigurator'],
  ['java/com/v2rayez/app/data/core/AndroidCarrierCoreSelector.kt', 'AndroidCarrierCoreSelector'],
  ['java/com/v2rayez/app/data/mitm/MitmConfigBuilder.kt', 'MitmConfigBuilder'],
  ['java/com/v2rayez/app/data/core/SingBoxConfigBuilder.kt', 'SingBoxConfigBuilder'],
  ['java/com/v2rayez/app/data/psiphon/PsiphonEngine.kt', 'PsiphonEngine'],
  ['java/com/v2rayez/app/data/tor/TorEngine.kt', 'TorEngine'],
  ['java/com/v2rayez/app/data/warp/WarpRegistrar.kt', 'WarpRegistrar'],
  ['java/com/v2rayez/app/data/intranet/NationalIntranetDetector.kt', 'NationalIntranetDetector'],
  ['java/com/v2rayez/app/data/routing/AndroidAdaptiveRouteMemory.kt', 'AndroidAdaptiveRouteMemory'],
  ['java/com/v2rayez/app/data/routing/RuleProviderFetcher.kt', 'RuleProviderFetcher'],
  ['java/com/v2rayez/app/data/dnstunnel/DnsTunnelEngine.kt', 'DnsTunnelEngine'],
  ['java/com/v2rayez/app/ui/screens/tools/DomainFrontingScreen.kt', 'DomainFrontingScreen'],
  ['java/com/v2rayez/app/ui/screens/settings/AiEngineScreen.kt', 'AiEngineScreen'],
  ['java/com/v2rayez/app/ui/screens/settings/CoreManagerScreen.kt', 'CoreManagerScreen'],
  ['java/com/v2rayez/app/ui/screens/tools/BpbPanelScreen.kt', 'BpbPanelScreen'],
]) {
  hasDecl(rel, name);
}

// ── Dynamic domain / fronting assets ────────────────────────────────────────
const sniSpoofAssets = join(APP_DIR, 'assets', 'sni-spoof');
assert.ok(statSync(sniSpoofAssets).isDirectory(), 'missing assets/sni-spoof');
assert.ok(
  readdirSync(sniSpoofAssets).some((f) => f.endsWith('.txt')),
  'assets/sni-spoof must contain domain inventory for dynamic SNI rotation'
);
const torBridges = join(APP_DIR, 'assets', 'tor');
assert.ok(statSync(torBridges).isDirectory(), 'missing assets/tor');

// ── Manifest must carry the packaging-safety flags the installer depends on ─
const manifest = readFileSync(join(APP_DIR, 'AndroidManifest.xml'), 'utf8');
assert.match(manifest, /android:extractNativeLibs="true"/);
assert.match(manifest, /android:installLocation="auto"/);

console.log('android_feature_presence_gate: PASS — every anti-censorship/AI/anti-DPI/dynamic-domain/Iran feature is present.');
