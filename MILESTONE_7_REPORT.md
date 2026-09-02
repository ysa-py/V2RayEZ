# Milestone 7 Report — Correction: V2RayEZ GUI Is Mandatory

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## User Correction Applied

The user clarified: **the legacy donor GUI is not acceptable as the final GUI. The final GUI must be V2RayEZ GUI, fully automatic.**

I corrected the desktop/UI direction accordingly:

- The legacy Aether GUI donor is now treated only as donor behavior/source material for Aether engine integration, updater/routing patterns, and compatibility.
- The shipped/product GUI identity is V2RayEZ.
- The desktop Tauri surface now uses V2RayEZ product names, window titles, package names, bundle identifiers, installer names, update allowlist, status wording, and about text.
- Aether remains only an engine adapter behind V2RayEZ, not the application GUI.

## Files Corrected

Under `V2RayEZ-GUI/`:

- `package.json` and `package-lock.json`
  - Package identity changed to `@v2rayez/universal-gui`.
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/main.rs`
  - Rust crate/lib identity changed from legacy Aether GUI donor naming to V2RayEZ GUI naming.
- `src-tauri/tauri.conf.json`
  - Product name/title/identifier/publisher/description changed to V2RayEZ.
  - Windows + Linux bundle targets remain present.
- `src/index.html`, `src/i18n.js`, `src/app.js`, `src/styles.css`
  - User-visible product/status/about strings now present V2RayEZ GUI.
  - Brand mark changed from donor `A` to V2RayEZ `V`.
  - License and AI Engine screens remain additive and still use the same compact UI style.
- `src-tauri/src/update.rs`, `.github/workflows/release.yml`, `scripts/package-release.ps1`, `src-tauri/windows/hooks.nsh`
  - Release/update/install names changed to V2RayEZ.
- `src-tauri/src/routing.rs`
  - Routing recovery/adapter messages changed to V2RayEZ.
- `NOTICE.md`
  - Final bundled notice now says V2RayEZ is the GUI/product identity while preserving Aether third-party notice traceability.
- The imported Android companion code and docs under `V2RayEZ-GUI/` were also rebranded to V2RayEZ-visible names, package metadata, update URLs, and app strings while preserving Aether engine integration behavior.

Root docs updated:

- `GEMINI_V2RAYEZ_UNIVERSAL_PROMPT.md`
- `docs/LICENSE_API.md`
- `docs/AI_PROVIDER_GATEWAY.md`
- `MERGE_TRACEABILITY.md`
- `FEATURE_MATRIX.md`
- `UI_CHANGELOG.md`
- `TEST_EVIDENCE.md`
- `THIRD_PARTY_NOTICES.md`

## Validation Run

```bash
cd "V2RayEZ-GUI"
node --check src/app.js
node --check src/i18n.js
node --check tests/frontend.test.mjs
npm test
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri config json pass')"
```

Result: PASS.

Observed:

- `npm test` PASS — 14/14 frontend/static tests.
- Tauri config JSON parse PASS.
- No legacy donor GUI product strings remain in `src`, `src-tauri`, or `tests`; Aether references remain only as engine-adapter references.

## Remaining Blockers

The correction is static/UI/product-identity complete, but platform builds remain blocked by the already documented missing toolchains:

- Rust/Tauri build: blocked because `cargo`/`rustc` are absent; the release workflow no longer uses `--locked` until `Cargo.lock` can be regenerated with the new V2RayEZ/universal-core dependency graph.
- Windows `.exe` installer/portable: blocked because Windows/MSVC/Tauri build runner is absent.
- Linux packages: blocked because Rust/Tauri build runner is absent.
- Android/iOS/OpenWrt real builds and traffic tests remain pending under their documented platform toolchain blockers.
