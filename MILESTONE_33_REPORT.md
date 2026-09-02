# Milestone 33 Report — Android Persisted AI Settings Migration

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Make the base V2RayEZ Android application self-heal old persisted AI Engine settings so restored backups or upgraded installs do not surface donor/default identities as product UI/UX. The UI must continue to be V2RayEZ while legacy settings still resolve automatically.

## Changes Applied

- Extended `SupportedLanguages.normalizeSettings()` into a broader persisted-settings normalizer for Android DataStore.
- Added AI Engine migration logic for persisted settings:
  - `local-aether`, `local_micafp`, and `local-micafp` provider IDs are canonicalized to `local-v2rayez`.
  - `local://aether` and `local://micafp` URLs are canonicalized to `local://v2rayez`.
  - `aether-anti-dpi-local` and `micafp-anti-dpi-local` models are canonicalized to `v2rayez-anti-dpi-local`.
  - empty provider lists self-heal to the default V2RayEZ local provider.
  - the canonical local provider is forced to `V2RayEZ Local AI`, local provider type, enabled, no endpoint, no API-key alias, and response path `text`.
  - duplicate legacy/canonical local provider entries are collapsed by canonical provider ID.
- Added `tools/android_ai_settings_migration_gate.mjs` to enforce this migration wiring statically.
- Added the new Android AI settings migration gate to `docs/ci/github-workflows/universal-source-gates.yml.sample`.

## Validation Run

```bash
node --check tools/android_ai_settings_migration_gate.mjs
node tools/android_ai_settings_migration_gate.mjs
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node --check tools/v2rayez_identity_gate.mjs
node tools/v2rayez_identity_gate.mjs
node --check tools/license_serial_e2e_selftest.mjs
node tools/license_serial_e2e_selftest.mjs
node --check tools/ai_provider_gateway_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
bash 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh'
npm test --prefix V2RayEZ-GUI
git diff --check
```

Result: PASS.

## Scope Note

This migration preserves legacy compatibility values only as input aliases. It does not expose donor GUI/product identity as the Android product UI and does not remove donor networking capabilities.

## Still Blocked Locally

Native Android Gradle compilation and APK generation remain blocked by the sandbox lacking the full Android build/signing environment.
