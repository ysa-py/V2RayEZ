# Milestone 43 Report — Browser Extension WASM Artifact Fail-Closed Release Guard

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Prevent browser-extension release artifacts from silently including an empty placeholder WebAssembly obfuscator. This aligns the extension packaging path with the universal release-artifact contract: release builds must use real artifacts or fail closed.

## Changes Applied

- Updated `MICAFP/extensions/scripts/build-extension.mjs`:
  - the real `obfuscator.wasm` is still copied when present.
  - an empty WASM module is now allowed only when `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1` is explicitly set for local development fallback testing.
  - normal builds, including `scripts/build-release-artifacts.sh`, now fail with a clear error if the real WASM obfuscator artifact is missing.
- Updated `tools/release_artifact_contract_gate.mjs`:
  - asserts the extension builder contains the development-only override.
  - asserts a fail-closed error path exists.
  - blocks the previous unconditional placeholder pattern.

## Validation Run

```bash
node --check MICAFP/extensions/scripts/build-extension.mjs
node --check tools/release_artifact_contract_gate.mjs
node tools/release_artifact_contract_gate.mjs
scripts/build-release-artifacts.sh --check
node tools/v2rayez_identity_gate.mjs
git diff --check
```

Result: PASS.

## Scope Note

This milestone does not build the real WASM obfuscator locally because Rust/WASM toolchains are unavailable in this sandbox. It ensures release packaging cannot accidentally hide that blocker by shipping a placeholder.
