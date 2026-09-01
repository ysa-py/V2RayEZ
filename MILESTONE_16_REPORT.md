# Milestone 16 Report — Browser Extension V2RayEZ Packaging Path

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Goal

Continue the mandatory browser-extension target by rebranding Chrome/Firefox extension artifacts to V2RayEZ Universal and fixing the extension packaging path so real extension bundles can be generated from the TypeScript sources.

## Changes Applied

- Rebranded Chrome and Firefox extension manifests/package metadata:
  - Names: `V2RayEZ Universal`.
  - Version: `2.0.0`.
  - Package names: `v2rayez-universal-chrome-extension` and `v2rayez-universal-firefox-extension`.
  - Firefox extension ID: `v2rayez@ysa-py.github.io`.
- Rebranded visible popup/options copy from donor UnifiedShield wording to V2RayEZ.
- Added generated V2RayEZ icon assets required by both browser manifests:
  - `icons/icon16.png`.
  - `icons/icon48.png`.
  - `icons/icon128.png`.
- Added `MICAFP/extensions/scripts/build-extension.mjs`:
  - Cleans/rebuilds each extension dist directory.
  - Runs TypeScript emission from the existing source tree.
  - Patches emitted relative ESM imports with `.js` suffixes for browser-extension module loading.
  - Rewrites packaged manifests with final V2RayEZ identity and correct built background paths.
  - Copies popup/options/icons/shared modules into the final dist package.
  - Stages a real WASM obfuscator when available; otherwise writes a valid empty WASM module and relies on runtime export validation to fall back deterministically.
- Hardened Chrome/Firefox WASM loaders so incomplete placeholder/missing WASM exports are rejected and the existing non-WASM fallback path is used.
- Changed extension `lint` scripts to `tsc --noEmit`, because ESLint v9 requires a flat config that the donor extension workspace did not include.
- Updated CI workflow templates to lint/build/package/upload Chrome and Firefox extension bundles.
- Regenerated `MERGE_INVENTORY.json` after adding extension packaging assets.

## Validation Run

```bash
npm ci --ignore-scripts --workspace extensions/chrome --workspace extensions/firefox
npm run lint --workspace extensions/chrome
npm run lint --workspace extensions/firefox
npm run build --workspace extensions/chrome
npm run build --workspace extensions/firefox
node --check MICAFP/extensions/scripts/build-extension.mjs
python3 -m json.tool MICAFP/extensions/chrome/manifest.json >/dev/null
python3 -m json.tool MICAFP/extensions/firefox/manifest.json >/dev/null
python3 -m json.tool MICAFP/extensions/chrome/package.json >/dev/null
python3 -m json.tool MICAFP/extensions/firefox/package.json >/dev/null
node - <<'NODE'
const fs = require('fs');
for (const path of ['MICAFP/extensions/chrome/dist/manifest.json', 'MICAFP/extensions/firefox/dist/manifest.json']) {
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (manifest.name !== 'V2RayEZ Universal' || manifest.version !== '2.0.0') throw new Error(`${path} identity drift`);
  console.log('extension manifest pass', path, manifest.name, manifest.version, manifest.action?.default_popup || manifest.browser_action?.default_popup);
}
NODE
(cd MICAFP/extensions/chrome/dist && zip -qr ../../v2rayez-chrome-extension.zip .)
(cd MICAFP/extensions/firefox/dist && zip -qr ../../v2rayez-firefox-extension.zip .)
ls -l MICAFP/extensions/v2rayez-*-extension.zip
rm -f MICAFP/extensions/v2rayez-chrome-extension.zip MICAFP/extensions/v2rayez-firefox-extension.zip
python3 tools/merge_inventory.py
git diff --check
```

Result: PASS, with an explicit warning that the real WASM obfuscator artifact is not present in this Linux sandbox.

Observed:

- Extension dependencies installed successfully for Chrome/Firefox workspaces.
- Chrome and Firefox TypeScript lint/typecheck PASS.
- Chrome and Firefox package builds PASS.
- Packaged manifests validate as V2RayEZ Universal v2.0.0.
- Test zips were produced successfully and removed after validation.
- `MERGE_INVENTORY.json` regenerated.
- `git diff --check` PASS.

## Still Pending

- Real WASM obfuscator compilation still requires Rust/wasm-pack, which are unavailable locally.
- Browser installation/runtime tests still require Chrome/Firefox in a GUI-capable environment.
