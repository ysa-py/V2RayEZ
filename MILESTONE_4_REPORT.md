# Milestone 4 Report — OpenWrt LuCI License + AI Wiring

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Scope Completed

This milestone adds first-pass OpenWrt/LuCI wiring for the required serial/license mode and no-code AI Provider Gateway using the existing MICAFP/UnifiedShield OpenWrt package path.

## OpenWrt Changes

Changed under `MICAFP/openwrt/`:

- `files/etc/config/unifiedshield`
  - Added license gate settings: validation URL, account ID, device label, public-key file, offline grace toggle, last result/reason/expiry, and offline grace expiry.
  - Added AI Engine settings: enable toggle, selected provider ID, automatic local fallback, local model, last test result.
  - Added default `config ai_provider 'local_aether'` for the local V2RayEZ/Aether fallback provider.
- `src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua`
  - Added a full LuCI CBI configuration page for V2RayEZ Universal / UnifiedShield.
  - Exposes License status/metadata and a validate-now action without storing/displaying the signed serial in LuCI.
  - Exposes AI Engine toggles and a dynamic `ai_provider` table for local, OpenAI-compatible, Anthropic, Gemini, and generic HTTP providers.
  - Provider additions are no-code and use alias-based secret files under `/etc/unifiedshield/ai-secrets/`.
- `files/usr/libexec/unifiedshield/license-gate.sh`
  - Fail-closed service gate called before daemon start/reload.
  - Prefers `/usr/bin/v2rayez-license-gate` for universal-core-backed local Ed25519 serial/grace verification.
  - Provides online dashboard validation fallback via `curl`, `uclient-fetch`, or `wget`.
  - Refuses offline grace when the native verifier is absent, instead of accepting unverifiable tokens.
  - Updates UCI status fields without logging the raw serial.
- `files/usr/libexec/unifiedshield/ai-provider-test.lua`
  - Tests selected external providers using UCI config and alias-based secret files.
  - Supports provider-family headers/templates and local fallback.
  - Redacts API secrets from result text/status.
- `files/etc/init.d/unifiedshield`
  - Added procd service wrapper that calls the license gate before starting/reloading the daemon.
  - Blocks daemon startup when the license gate fails.
- `Makefile`
  - Normalized package naming toward `unifiedshield`.
  - Installs `/etc/config/unifiedshield`, `/etc/init.d/unifiedshield`, license/AI helper scripts, and the new LuCI controller/CBI config path.
- `src/luci-app-unifiedshield/luasrc/controller/unifiedshield.lua`
  - Status JSON now includes license and AI status metadata.
  - Added `validate_license` and `test_ai_provider` JSON actions.

## Validation Run

Shell syntax checks:

```bash
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
```

Result: PASS.

Lua runtime/parser:

```bash
lua -v
```

Result: BLOCKED — Lua/LuCI runtime is not installed in this sandbox, so `ai-provider-test.lua` and LuCI CBI/controller syntax were not executed.

OpenWrt package build:

Result: BLOCKED — OpenWrt SDK/toolchain is not installed; no `.ipk` was built locally.

## Important Security Status

The OpenWrt gate is intentionally fail-closed:

- If `/usr/bin/v2rayez-license-gate` exists, it is expected to perform local Ed25519 serial verification, public-key validation, signed grace-token checks, device binding, and UCI status persistence using the shared `universal-core` verifier.
- If the native verifier is absent, the shell fallback can only permit online dashboard validation.
- Offline grace is not accepted by the shell fallback because accepting unverifiable grace tokens would violate the anti-forgery requirement.

## Remaining Blockers / Pending Validation

- Build the native OpenWrt `v2rayez-license-gate` binary from `universal-core` once Rust/OpenWrt SDK are available.
- Run LuCI Lua syntax/runtime tests in an OpenWrt SDK/rootfs.
- Build universal/generic `.ipk` artifacts for target router architectures.
- Run router E2E tests: valid serial start, expired serial block, revoked serial block, offline grace expiry hard cutoff, external AI blocked fallback, DNS/no-leak behavior, and real tunnel traffic.
