# Milestone 25 Report — Browser Extension V2RayEZ Storage Migration

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Finish the browser-extension identity migration by making new installs prefer V2RayEZ storage keys while preserving compatibility with prior donor/UnifiedShield extension storage.

## Changes Applied

- Preferred extension storage keys are now V2RayEZ branded:
  - `v2rayez_config`
  - `v2rayez_state`
  - `v2rayez_stats`
  - `v2rayez_extension_secrets`
- Legacy keys remain declared for migration reads:
  - `unifiedshield_config`
  - `unifiedshield_state`
  - `unifiedshield_stats`
- Chrome MV3 and Firefox MV2 background scripts now load preferred V2RayEZ config/state first, then fall back to legacy donor keys.
- Chrome/Firefox options pages now read preferred V2RayEZ config first, then legacy config, and save future changes to the V2RayEZ key.
- Milestone 24 report/evidence were clarified to note generated `dist/` outputs remain ignored and legacy storage fallback is preserved.

## Validation Run

```bash
set -e
npm run lint --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
npm run build --prefix MICAFP/extensions/chrome
npm run build --prefix MICAFP/extensions/firefox
python3 - <<'PY'
from pathlib import Path
protocol = Path('MICAFP/extensions/shared/protocol.ts').read_text()
for needle in ['CONFIG: \'v2rayez_config\'', 'LEGACY_CONFIG: \'unifiedshield_config\'', 'STATE: \'v2rayez_state\'', 'LEGACY_STATE: \'unifiedshield_state\'']:
    assert needle in protocol, needle
for path in ['MICAFP/extensions/chrome/background/service-worker.ts','MICAFP/extensions/firefox/background/background.ts']:
    text = Path(path).read_text()
    for needle in ['StorageKeys.LEGACY_CONFIG', 'StorageKeys.LEGACY_STATE', 'savedConfig', 'savedState']:
        assert needle in text, f'{path}: {needle}'
for path in ['MICAFP/extensions/chrome/options/options.ts','MICAFP/extensions/firefox/options/options.ts']:
    text = Path(path).read_text()
    for needle in ['StorageKeys.LEGACY_CONFIG', 'savedConfig', 'StorageKeys.SECRETS']:
        assert needle in text, f'{path}: {needle}'
print('extension storage migration checks pass')
PY
git diff --check
```

Result: PASS.

Expected warning remains:

- Real WASM obfuscator artifact is missing; packaged empty WASM fallback remains deterministic during extension builds.

## Still Pending

- Browser runtime migration test using a profile containing old `unifiedshield_*` keys.
- Chrome/Firefox runtime license validation with real signed serial and dashboard endpoint.
