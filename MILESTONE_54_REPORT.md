# Milestone 54 — Browser Extension Legacy Entrypoint Identity Cleanup

## Scope
- Continue the extension-tree audit by cleaning legacy/root WebTransport entrypoints that are still packaged as compatibility artifacts.
- Preserve those capabilities and legacy storage compatibility; do not delete old files or break migration from previous storage keys.
- Expand the runtime identity gate so stale extension-visible donor wording cannot reappear silently.

## Changes
- `MICAFP/extensions/chrome/background.ts`
  - Updated legacy WebTransport service-worker comments/log labels from the old Shield branding to V2RayEZ.
  - Primary storage keys now use `v2rayez_state`, `v2rayez_stats`, and `v2rayez_config`.
  - Added fallback reads for both old `shield_*` keys and prior `unifiedshield_*` keys before defaulting, so existing installs are not stranded.
  - Updated the generated PAC placeholder host/comment from `shield.proxy` to `v2rayez.proxy`.
- `MICAFP/extensions/firefox/background.ts`
  - Mirrored the V2RayEZ log/comment cleanup and storage-key migration/fallback behavior for the legacy Firefox WebTransport background.
- `MICAFP/extensions/shared/webtransport_tunnel.ts`
  - Updated shared WebTransport tunnel header/log labels to V2RayEZ while preserving transport behavior.
- Legacy popup/source artifacts
  - Updated Chrome/Firefox legacy popup headers and About links to the canonical `ysa-py/V2RayEZ` repository.
  - Updated popup/options CSS and secondary source headers from legacy visible Shield/MICAFP labels to V2RayEZ.
- `tools/v2rayez_identity_gate.mjs`
  - Added extension-visible identity checks for stale `MICAFP-UnifiedShield`, `MICAFP-V2RayEZ`, old `UnifiedShield ... Popup/Options/Background/Styles`, `[Shield]` logs, and `github.com/MICAFP/V2RayEZ` links.

## Validation
- `npm run lint --prefix MICAFP/extensions/chrome` — passed.
- `npm run lint --prefix MICAFP/extensions/firefox` — passed.
- `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/chrome` — passed; development-only WASM fallback used in sandbox.
- `V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 npm run build --prefix MICAFP/extensions/firefox` — passed; development-only WASM fallback used in sandbox.
- `node tools/v2rayez_identity_gate.mjs` — passed with the new extension-visible stale identity checks.
- `node tools/runtime_license_watchdog_gate.mjs` — passed.
- `node tools/release_artifact_contract_gate.mjs` — passed.
- `scripts/build-release-artifacts.sh --check` — passed.
- `git diff --check` — passed.

## Limits / Remaining Work
- This milestone intentionally keeps old compatibility domains/host fallbacks where they may still be required operationally; it only removes stale visible/log/source identity and adds migration fallback.
- Real browser install/runtime tests are still required on Chrome/Firefox with a real WASM artifact and native host registration.
