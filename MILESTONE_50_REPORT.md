# Milestone 50 Report — Browser Extension Signed Serial and Device-Bound Grace Enforcement

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`
PR: https://github.com/ysa-py/V2RayEZ/pull/1

## Goal

Close remaining browser-extension license hardening gaps without removing any extension capability: cached offline grace must be signed, tied to the active serial/account/device/platform, and observable/configurable from the V2RayEZ extension options UI.

## Changes Applied

### Chrome and Firefox background gates

- Added local signed serial verification when an Ed25519 public key is configured:
  - verifies compact token format, `EdDSA`, `V2RayEZ-License`, and `v2rayez.license.v1`.
  - rejects local hard failures before connect: invalid schema, inactive license, account mismatch, not-yet-valid, invalid expiry, and expired license.
  - permits online revalidation to recover if local verification fails but a validation server is configured; offline cached grace is not used when the serial cannot be verified locally.
- Strengthened signed grace usage:
  - verifies grace token signature/schema using WebCrypto Ed25519.
  - compares grace license/user/account fields against the locally verified signed serial when available.
  - verifies account and platform fields.
  - verifies device binding by recomputing dashboard-compatible `deviceIdHash` for `browser-extension:<runtime-id>`.
  - enforces license expiry, grace expiry, and server-time rollback cutoffs from signed grace payload fields.
- Online validation remains allowed when the server accepts the serial even if a returned grace token cannot be cached; in that case the extension clears cached grace and records `offline_grace_not_cached:*` instead of incorrectly treating the online validation as unreachable.

### Options UI and shared config

- Added `licenseDeviceHashSalt` to shared extension config and defaults.
- Chrome/Firefox options pages now expose `Device hash salt` with guidance that it must match the dashboard license device salt for offline grace device binding.
- Changing serial/account/public key/validation URL/device hash salt clears stale grace tokens.

### Static gate

- `tools/runtime_license_watchdog_gate.mjs` now asserts:
  - signed serial verification is present.
  - grace verification compares signed license/grace/device fields.
  - device-hash salt UI/config exists.
  - stale grace rotation covers the salt field.

## Validation Run

```bash
npm run lint --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/chrome
V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/firefox
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node tools/release_artifact_contract_gate.mjs
scripts/build-release-artifacts.sh --check
node tools/v2rayez_identity_gate.mjs
git diff --check
```

Result: PASS.

## Scope Note

The extension package builds used `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1` only for local development validation because this sandbox lacks Rust/WASM toolchains. Release builds still require the real WASM obfuscator and fail closed when it is missing.
