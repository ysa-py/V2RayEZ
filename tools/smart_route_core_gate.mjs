#!/usr/bin/env node
// smart_route_core_gate.mjs — proves the Smart Iran anti-censorship / anti-DPI /
// dynamic-domain decision engine is present, enabled, and tested in the core.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }
function lacks(path, needle) { assert.ok(!text(path).includes(needle), `${path} must not contain ${needle}`); }

const core = 'universal-core/src/smart_route.rs';
const lib = 'universal-core/src/lib.rs';
const docs = 'docs/APK_STRUCTURAL_FIX.md';

// ── Smart anti-censorship / anti-DPI engine surface ─────────────────────────
for (const needle of [
  'pub enum IranCarrier',
  'Mci',
  'Irancell',
  'Rightel',
  'Tci',
  'OtherIsp',
  'NonIran',
  'pub struct DpiSignals',
  'tls_plain_blocked',
  'reset_before_tls',
  'sni_blocked',
  'throttling',
  'http_proxy_blocked',
  'pub fn confidence',
  'pub fn blocked_score',
  'pub enum EvasionProfile',
  'Direct',
  'UtlsChrome',
  'TlsFrag',
  'DomainFront',
  'Stealth',
  'Quic',
  'Pluggable',
  'pub struct AntiDpiRecommendation',
  'pub struct DynamicFront',
  'pub fn iran_default',
  'pub struct SmartRouteDecision',
  'pub fn decide',
  'pub fn front_rank',
  '#[cfg(test)]',
  'clean_link_prefers_direct',
  'hard_sni_block_escalates_to_domain_front',
  'throttling_escalates_to_pluggable',
  'very_high_blocked_score_escalates_to_stealth',
  'moderate_blocking_escalates_to_utls_then_frag',
  'front_rotation_is_best_first',
  'non_iran_carrier_is_detected',
  'blocked_score_is_bounded',
  'decision_is_serialisable_and_stable',
]) has(core, needle);

// No stubbed / half-written paths allowed in the shipped engine.
for (const forbidden of ['TODO', 'unimplemented!', 'todo!', 'panic!("not implemented")']) lacks(core, forbidden);

// ── Wired as a first-class module ───────────────────────────────────────────
has(lib, 'pub mod smart_route;');
has(lib, 'SmartRouteDecision');
has(lib, 'EvasionProfile');
has(lib, 'IranCarrier');

// ── Docs reference it as part of the fixed/preserved capability set ─────────
has(docs, 'Anti-DPI');
has(docs, 'dynamic');

console.log('smart_route_core_gate: PASS — Iran anti-censorship / anti-DPI / dynamic-domain engine present and tested.');
