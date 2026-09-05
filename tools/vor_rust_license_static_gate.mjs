#!/usr/bin/env node
// Vor Rust offline-license static gate.
//
// `cargo`/`rustc` are not available in the current sandbox (see
// CONTINUATION_REPORT.md), so this gate cannot compile or run `cargo test`. It
// statically locks the Rust source contract that the offline serial decision:
//   - verifies serial-level device binding from the signed serial,
//   - verifies/schema-checks a signed `V2RayEZ-Revocation-List` token,
//   - allows a valid signed serial WITHOUT forcing a grace-token fallback,
//   - wires the revocation-list token through both the CLI gate and desktop shell.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const license = read('universal-core/src/license.rs');
assert.ok(license.includes('pub fn verify_revocation_list'), 'license.rs must verify signed revocation lists');
assert.ok(license.includes('V2RayEZ-Revocation-List'), 'license.rs must use the V2RayEZ-Revocation-List token type');
assert.ok(license.includes('v2rayez.license.revocations.v1'), 'license.rs must enforce the revocation-list schema');
assert.ok(license.includes('signed_revocation_list'), 'offline_start_decision must accept a signed revocation list');
assert.ok(license.includes('UnsupportedRevocationSchema'), 'unsupported revocation schema must fail closed');
assert.ok(license.includes('device_id_hash'), 'VerifiedLicense must carry the serial-level device binding');
assert.ok(license.includes('signed_serial_valid'), 'signed serial must be allowed offline without grace token');
assert.ok(license.includes('allow_offline'), 'offline_start_decision must have a no-grace allow path');
assert.ok(license.includes('license_revoked'), 'revoked serial must be denied offline');
assert.ok(license.includes('device_mismatch'), 'device-bound serial must be enforced offline');

// The no-grace branch must be an explicit allow, not a deny requiring grace.
const noGraceBlock = license.slice(license.indexOf('let Some(grace_token) = signed_grace_token else'));
assert.ok(
  noGraceBlock.includes('return LicenseDecision::allow_offline("signed_serial_valid"'),
  'offline_start_decision must allow signed serial when NO grace token is present',
);

const cli = read('universal-core/src/bin/v2rayez-license-gate.rs');
assert.ok(cli.includes('revocation_list_file'), 'license-gate must carry a revocation-list file path');
assert.ok(cli.includes('--revocation-list-file'), 'license-gate must expose --revocation-list-file');
assert.ok(cli.includes('revocation_list.as_deref()'), 'license-gate must pass revocation list to offline_start_decision');
assert.ok(cli.includes('server_unreachable_using_serial'), 'offline serial fallback must work when server unreachable');

const desktop = read('V2RayEZ-GUI/src-tauri/src/license.rs');
assert.ok(desktop.includes('revocation_list_token'), 'desktop license state must persist revocation list token');
assert.ok(desktop.includes('state.revocation_list_token.as_deref()'), 'desktop shell must pass revocation list to offline_start_decision');
assert.ok(desktop.includes('license_revoked') && desktop.includes('device_mismatch'), 'desktop local path must enforce device binding and revocation');
assert.ok(!desktop.includes('online_validation_or_grace_token_required'), 'desktop offline path must not require a grace-token fallback');

console.log(
  'vor_rust_license_static_gate: PASS (static source contract; cargo test still BLOCKED because cargo/rustc are absent)',
);
