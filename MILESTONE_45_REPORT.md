# Milestone 45 Report — Browser Extension Signed Grace Verification and Build Emit Fix

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Strengthen browser-extension license anti-forgery behavior and fix the extension build script so it reliably uses the local TypeScript compiler during package generation.

## Changes Applied

### Signed grace verification for Chrome/Firefox extensions

- Added `licensePublicKeyPem` to shared extension config and options UI.
- Chrome and Firefox options pages now expose an `Ed25519 Public Key PEM` field and explain that it is required for signed offline grace verification.
- Extension background license gates now:
  - keep the serial and grace token in the secret storage bucket.
  - verify grace-token compact format, `EdDSA` header, `V2RayEZ-License-Grace` type, and `v2rayez.license.grace.v1` schema.
  - verify the Ed25519 grace-token signature with WebCrypto when a public key is configured.
  - reject cached grace use with `license_public_key_missing`, `grace_signature_invalid:*`, `offline_grace_account_mismatch`, `offline_grace_platform_mismatch`, `offline_grace_inactive`, `license_expired`, `offline_grace_expired`, or `server_time_rollback_detected` as appropriate.
  - use signed grace payload fields for expiry, grace-until, and server-time rollback checks instead of trusting mutable UI metadata alone.
- Shared extension protocol now includes `licenseGraceServerTime`, `licenseLastServerTime`, and `licensePublicKeyPem` defaults.

### Extension build emit fix

- `MICAFP/extensions/scripts/build-extension.mjs` now prefers the local `node_modules/.bin/tsc` compiler when present.
- If local TypeScript is missing, it falls back to `npx --package typescript tsc` instead of accidentally invoking the unrelated deprecated `tsc` package.
- The Milestone 43 fail-closed real-WASM behavior remains intact.

### Static gates

- `tools/runtime_license_watchdog_gate.mjs` now asserts extension public-key UI, signed grace verification, and signed cached-grace behavior.
- `tools/release_artifact_contract_gate.mjs` now asserts the explicit TypeScript emit helper and local compiler path.

## Validation Run

```bash
npm run lint --prefix MICAFP/extensions/chrome
V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/firefox
node --check MICAFP/extensions/scripts/build-extension.mjs
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node --check tools/release_artifact_contract_gate.mjs
node tools/release_artifact_contract_gate.mjs
scripts/build-release-artifacts.sh --check
node tools/v2rayez_identity_gate.mjs
git diff --check
```

Result: PASS.

## Scope Note

The extension builds above used `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1` only to validate TypeScript/package flow in this sandbox. Release builds do not set that variable and still fail closed until a real WASM obfuscator is available.
