# Milestone 53 — Browser Extension Native Host V2RayEZ Migration

## Scope
- Move the active Chrome/Firefox browser-extension native messaging integration to a V2RayEZ-owned host ID while preserving the legacy native host as a compatibility fallback.
- Make the native host ID configurable from the extension options UI without code changes.
- Fix native-app enable/disable lifecycle handling so changing the option at runtime takes effect immediately instead of only being checked during script load.

## Changes
- `MICAFP/extensions/shared/protocol.ts`
  - Added `nativeMessagingHost` and `nativeMessagingHostFallbacks` to extension configuration.
  - Defaults now use `com.v2rayez.native` first and keep `com.unifiedshield.native` as an automatic fallback.
- `MICAFP/extensions/chrome/options/options.html` / `options.ts`
  - Added a **Native Messaging Host ID** field under Advanced settings.
  - Persists the configured host ID and keeps the legacy fallback list.
- `MICAFP/extensions/firefox/options/options.html` / `options.ts`
  - Added the same no-code Native Messaging Host ID control for Firefox.
- `MICAFP/extensions/chrome/background/service-worker.ts`
  - Native messaging now builds an ordered host candidate list from config: primary V2RayEZ host, then legacy fallback(s).
  - No longer hard-codes the legacy host as the primary `connectNative` target.
  - Added `syncNativeIntegration()` so enabling/disabling native integration in options connects or disconnects immediately.
  - Keeps SOCKS readiness handling and WebRTC fallback behavior intact.
- `MICAFP/extensions/firefox/background/background.ts`
  - Mirrors the Chrome native-host candidate and runtime sync behavior for Firefox.
- `tools/runtime_license_watchdog_gate.mjs`
  - Added static assertions for the V2RayEZ native host default, legacy fallback preservation, options UI wiring, runtime native sync, and absence of direct legacy-host primary connection.

## Validation
- `npm run lint --prefix MICAFP/extensions/chrome` — passed.
- `npm run lint --prefix MICAFP/extensions/firefox` — passed.
- `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/chrome` — passed; development-only WASM fallback used in sandbox.
- `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/firefox` — passed; development-only WASM fallback used in sandbox.
- `node tools/runtime_license_watchdog_gate.mjs` — passed.
- `node tools/release_artifact_contract_gate.mjs` — passed.
- `scripts/build-release-artifacts.sh --check` — passed.
- `node tools/v2rayez_identity_gate.mjs` — passed.
- `git diff --check` — passed.

## Limits / Remaining Work
- Native messaging host registration/installers were not executed in this sandbox. Real host manifests for `com.v2rayez.native` and compatibility fallback validation must run on Chrome/Firefox host machines.
- Browser builds still used the development-only empty WASM fallback because the local sandbox lacks the real `wasm-pack`/Rust release toolchain.
