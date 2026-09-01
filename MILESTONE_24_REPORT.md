# Milestone 24 Report — Browser Extension License and AI Provider Controls

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Extend the packaged V2RayEZ Chrome/Firefox extensions with the same serial/license and no-code AI provider concepts used by the desktop, mobile, dashboard, and OpenWrt surfaces, without changing the existing proxy/DoH/WebRTC UI flow.

## Changes Applied

- Extended shared extension protocol types and defaults:
  - License validation URL, account ID, offline grace toggle, installed-secret flags, and last validation metadata.
  - AI Engine enable toggle, automatic local fallback, provider alias/base URL/endpoint/model, and installed API-key flag.
  - Separate `StorageKeys.SECRETS` (`v2rayez_extension_secrets`) so serial/API key values are not mixed into exported normal config.
- Added options-page controls for both Chrome and Firefox:
  - Signed serial/license token field.
  - License account ID and validation server URL.
  - Offline grace toggle.
  - AI Engine/API provider alias, base URL, endpoint, model, and API key field.
  - Secret placeholders (`••••••••`) hide already-installed secrets after saving.
- Updated options-page logic for both Chrome and Firefox:
  - Saves secret values separately from normal config.
  - Sanitizes AI provider aliases.
  - Keeps existing secrets when the placeholder is left unchanged.
  - Reset clears both normal config and extension secrets.
- Added browser-extension license preflight to Chrome MV3 and Firefox MV2 background scripts:
  - If serial mode is not enabled, current extension behavior is preserved.
  - If a serial is installed, proxy startup validates online against `/api/licenses/validate`.
  - On validation success, stores expiry/grace metadata in config.
  - On server failure, uses cached grace only when configured and not expired.
  - Fails closed after license expiry or offline grace expiry.
- Rebuilt Chrome and Firefox dist packages during validation so generated package output matches source (the repository continues to keep `dist/` ignored).

## Validation Run

```bash
set -e
npm run lint --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
npm run build --prefix MICAFP/extensions/chrome
npm run build --prefix MICAFP/extensions/firefox
python3 - <<'PY'
import json
from html.parser import HTMLParser
from pathlib import Path
class Parser(HTMLParser): pass
for path in ['MICAFP/extensions/chrome/options/options.html','MICAFP/extensions/firefox/options/options.html','MICAFP/extensions/chrome/dist/options/options.html','MICAFP/extensions/firefox/dist/options/options.html']:
    text = Path(path).read_text()
    Parser().feed(text)
    for needle in ['licenseSerial', 'licenseValidationUrl', 'aiProviderAlias', 'aiApiKey', 'local://v2rayez']:
        assert needle in text, f'{path}: {needle}'
for path in ['MICAFP/extensions/chrome/dist/manifest.json','MICAFP/extensions/firefox/dist/manifest.json']:
    manifest = json.loads(Path(path).read_text())
    assert manifest['name'] == 'V2RayEZ Universal'
    assert manifest['version'] == '2.0.0'
print('extension package options/manifests pass')
PY
python3 - <<'PY'
from pathlib import Path
checks = {
'MICAFP/extensions/shared/protocol.ts':['SECRETS', 'licenseValidationUrl', 'aiProviderBaseUrl', 'local://v2rayez'],
'MICAFP/extensions/chrome/background/service-worker.ts':['enforceLicense', 'license_expired', 'offline_grace_expired', 'browser-extension', 'api/licenses/validate'],
'MICAFP/extensions/firefox/background/background.ts':['enforceLicense', 'license_expired', 'offline_grace_expired', 'browser-extension', 'api/licenses/validate'],
'MICAFP/extensions/chrome/options/options.ts':['SECRET_PLACEHOLDER', 'licenseSerial', 'aiApiKey', 'safeAlias'],
'MICAFP/extensions/firefox/options/options.ts':['SECRET_PLACEHOLDER', 'licenseSerial', 'aiApiKey', 'safeAlias'],
}
for path, needles in checks.items():
    text = Path(path).read_text()
    for needle in needles:
        assert needle in text, f'{path}: {needle}'
print('extension license/ai static checks pass')
PY
python3 tools/merge_inventory.py
git diff --check
```

Result: PASS.

- Chrome extension `tsc --noEmit` passed.
- Firefox extension `tsc --noEmit` passed.
- Chrome and Firefox package builds passed.
- Expected warning remains: real WASM obfuscator artifact is unavailable, so the packager stages the deterministic empty-WASM fallback.

Blocked locally:

- Browser runtime validation in Chrome/Firefox is not available in this sandbox.
- Online license validation requires a reachable dashboard license server and real signed serial.

## Still Pending

- Manual install/run in Chrome and Firefox.
- Browser extension online/offline license validation E2E against the dashboard.
- Real external AI provider call/fallback checks from extension runtime.
