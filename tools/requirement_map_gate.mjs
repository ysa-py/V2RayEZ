#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const doc = readFileSync('docs/V2RAYEZ_UNIVERSAL_REQUIREMENT_MAP.md', 'utf8');
for (const needle of [
  'V2RayEZ Universal Requirement Map',
  'V2RayEZ base app',
  'AetherGUI / Aethon',
  'EasySNI',
  'MICAFP-UnifiedShield',
  'MSN-GUARD',
  'UAC-SNI-Spoofer Android',
  'UAC-SNI-Spoofer Windows',
  'MasterDnsVPN',
  'Android universal `.apk`',
  'iOS `.ipa` Packet Tunnel',
  'Windows `.exe` installer + portable',
  'OpenWrt LuCI `.ipk` generic',
  'MasterDnsVPN DNS tunnel as first-class mode',
  'Named core inventory',
  'UAC adaptive connection fingerprint/champion/backup/cooldown',
  'License Manager offline Ed25519',
  'Serverless revocation list signed by same key',
  'IMPOSSIBLE-AS-STATED documented',
  'BLOCKED-LOCAL',
]) {
  assert.ok(doc.includes(needle), `requirement map missing ${needle}`);
}
console.log('requirement_map_gate: PASS');
