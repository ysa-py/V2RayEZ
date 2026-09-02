# Milestone 52 — Browser Extension Active Runtime Packaging Alignment

## Scope
- Ensure packaged Chrome and Firefox extension manifests activate the hardened V2RayEZ runtime that has the current license, AI/settings, server-time, and signed-grace controls.
- Keep legacy/root extension entrypoints packaged as compatibility artifacts without making them the active popup/background path.
- Fix Chrome request-monitor registration so MV3 installations do not fail when blocking webRequest is unavailable, while preserving blocking cancellation where the permission/API is supported.

## Changes
- `MICAFP/extensions/scripts/build-extension.mjs`
  - Prefers the modern `popup/popup.html` UI when present instead of the older root popup.
  - Sets Chrome `background.service_worker` to `chrome/background/service-worker.js`.
  - Sets Firefox `background.scripts[0]` to `firefox/background/background.js`.
  - Updates required-file checks so packaging fails if those hardened runtime files are not emitted.
- `MICAFP/extensions/chrome/manifest.json` and `MICAFP/extensions/firefox/manifest.json`
  - Declare the `alarms` permission required by the now-active periodic ISP/config/license-related runtime workers.
- `MICAFP/extensions/chrome/background/service-worker.ts`
  - Registers request monitoring via a guarded helper: use blocking webRequest where available, otherwise fall back to observe-only monitoring instead of breaking service-worker startup.
  - Keeps DPI/error observation and WebRTC fallback behavior intact.
- `MICAFP/extensions/chrome/background/service-worker.ts` and `MICAFP/extensions/firefox/background/background.ts`
  - Store the device-hash separator as escaped text (`\\0`) instead of embedding NUL bytes in TypeScript source, preserving deterministic hash input while keeping the source text-tool friendly.
- `tools/release_artifact_contract_gate.mjs`
  - Adds assertions that the release packager activates the hardened Chrome/Firefox runtime entrypoints, prefers the modern V2RayEZ popup, and keeps the required `alarms` permission.

## Validation
- `npm run lint --prefix MICAFP/extensions/chrome` — passed.
- `npm run lint --prefix MICAFP/extensions/firefox` — passed.
- `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/chrome` — passed; development-only WASM fallback used in sandbox.
- `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/firefox` — passed; development-only WASM fallback used in sandbox.
- Active manifest probes passed:
  - Chrome: `default_popup = popup/popup.html`, `background.service_worker = chrome/background/service-worker.js`, `alarms` permission present.
  - Firefox: `default_popup = popup/popup.html`, `background.scripts[0] = firefox/background/background.js`, `alarms` permission present.
- `node tools/release_artifact_contract_gate.mjs` — passed.
- `scripts/build-release-artifacts.sh --check` — passed.
- `node tools/runtime_license_watchdog_gate.mjs` — passed.
- `node tools/v2rayez_identity_gate.mjs` — passed.
- `git diff --check` — passed.

## Limits / Remaining Work
- The sandbox still uses `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1` for browser package-flow validation because the real Rust/wasm-pack toolchain is unavailable locally. Release runners must build without that flag.
- This milestone corrects which runtime is active in packaged browser extensions; it does not replace real browser install/runtime validation on Chrome/Firefox, real network/DPI tests, or signed release artifact production.
