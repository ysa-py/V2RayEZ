#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }
function lacks(path, needle) { assert.ok(!text(path).includes(needle), `${path} must not contain ${needle}`); }

const core = 'universal-core/src/route_matrix.rs';
const lib = 'universal-core/src/lib.rs';
const docs = 'docs/ANDROID_ROUTE_MATRIX_SPEED_TEST.md';
const report = 'MILESTONE_66_REPORT.md';

for (const needle of [
  'pub enum RouteMatrixPhase',
  'Qualification',
  'Stability',
  'Stress',
  'FinalAbba',
  'pub enum RouteDnsPreset',
  'CloudflareAliyun',
  'Quad9Aliyun',
  'AdGuardAliyun',
  'AliyunOnly',
  'FakeDns',
  'pub enum RouteFragmentPreset',
  'Off',
  'Fast',
  'Balanced',
  'Stealth',
  'pub const ROUTE_MATRIX_MTU_PRESETS: [u16; 4] = [1280, 1360, 1420, 1500]',
  'pub const FINAL_ABBA_ORDER: [usize; 4] = [0, 1, 1, 0]',
  'pub struct RouteEdge',
  'pub struct RouteMatrixCandidate',
  'pub struct RouteMatrixSettingsOverride',
  'pub struct RouteProbeSample',
  'pub struct RouteMatrixResult',
  'pub fn build_route_matrix',
  'RouteDnsPreset::ALL.into_iter()',
  'RouteFragmentPreset::ALL.into_iter()',
  'ROUTE_MATRIX_MTU_PRESETS.into_iter()',
  'pub fn route_matrix_score',
  'success_rate.clamp(0.0, 1.0) * 450.0',
  'latency_score * 90.0',
  'jitter_score * 70.0',
  'throughput_score * 18.0',
  'confidence.clamp(0.0, 1.0) * 120.0',
  'pub fn select_winner',
  'pub fn final_abba_candidates',
  '#[cfg(test)]',
  'builds_full_bounded_matrix',
  'scores_and_selects_successful_low_latency_candidate',
  'final_order_is_abba',
]) has(core, needle);

for (const forbidden of ['TODO', 'unimplemented!', 'todo!', 'panic!("not implemented")']) lacks(core, forbidden);

has(lib, 'pub mod route_matrix;');
has(lib, 'RouteMatrixSettingsOverride');
has(lib, 'FINAL_ABBA_ORDER');
has(docs, 'Shared-core follow-up');
has(docs, 'universal-core/src/route_matrix.rs');
has(report, 'Milestone 66');
has(report, 'universal-core/src/route_matrix.rs');

console.log('universal_route_matrix_core_gate: PASS');
