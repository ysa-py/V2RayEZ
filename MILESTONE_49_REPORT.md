# Milestone 49 Report — Extension Release WASM Build Wiring

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Make browser-extension release packaging build and consume the real Rust/WASM obfuscator artifact instead of depending on pre-existing local files or a development-only empty module.

## Changes Applied

- `scripts/build-release-artifacts.sh`
  - extension target now requires `cargo` and `wasm-pack` in addition to `npm`.
  - runs `wasm-pack build --target web --out-dir pkg` in `MICAFP/extensions/wasm-obfuscator` before building Chrome/Firefox packages.
  - keeps release behavior fail-closed when the Rust/WASM toolchain is missing.
- `MICAFP/extensions/scripts/build-extension.mjs`
  - now recognizes the actual wasm-pack output name `shield_obfuscator_bg.wasm` from the `shield-obfuscator` crate.
  - retains older candidate names only as compatibility fallbacks.
- `tools/release_artifact_contract_gate.mjs`
  - now asserts the extension release target requires `wasm-pack`, runs the wasm-pack build, and recognizes the real crate output artifact.

## Validation Run

```bash
npm run lint --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/chrome
V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/firefox
node --check MICAFP/extensions/scripts/build-extension.mjs
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node --check tools/release_artifact_contract_gate.mjs
node tools/release_artifact_contract_gate.mjs
scripts/build-release-artifacts.sh --check
node tools/v2rayez_identity_gate.mjs
node --check MICAFP/dashboard/src/lib/ai-provider-gateway.mjs
node tools/ai_provider_gateway_selftest.mjs
git diff --check
```

Result: PASS.

## Scope Note

The Chrome/Firefox package flow was validated with `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1` only because this sandbox does not have Rust/WASM tooling. The universal release build does not set that variable; it now builds the real WASM first and fails closed if `wasm-pack`/`cargo` are missing.
