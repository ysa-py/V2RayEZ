# Milestone 23 Report — Desktop V2RayEZ Identity and Local AI Defaults

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Apply the user's correction consistently to the desktop V2RayEZ GUI: Aether/Aethon must not surface as the product or GUI identity. Donor networking code can remain internally named where required, but user-visible desktop UI, status, prompts, and local AI defaults should present V2RayEZ.

## Changes Applied

- Desktop frontend defaults now use V2RayEZ local AI identity:
  - `local-v2rayez`
  - `local://v2rayez`
  - `v2rayez-anti-dpi-local`
- Added frontend migration compatibility for legacy saved local provider IDs:
  - `local-aether` → `local-v2rayez`
  - `local://aether` → `local://v2rayez`
  - `aether-anti-dpi-local` → `v2rayez-anti-dpi-local`
- Rust settings defaults now use the same V2RayEZ local AI identity.
- AI prompt/fallback text now asks for V2RayEZ anti-DPI guidance instead of V2RayEZ/Aether wording.
- Tauri process/routing user-visible messages now say V2RayEZ core/V2RayEZ instead of Aether.
- About text now presents donor work as integrated networking adapters behind V2RayEZ Universal, preserving provenance without making Aether the product.
- Retained internal donor binary/env names where changing them would risk breaking the imported Aether/MSN engine adapter.

## Validation Run

```bash
npm test --prefix V2RayEZ-GUI
python3 - <<'PY'
from pathlib import Path
text = Path('V2RayEZ-GUI/src/app.js').read_text()
for needle in ['local-v2rayez', 'local://v2rayez', 'v2rayez-anti-dpi-local', 'normalizeAiEngine', '[V2RayEZ core]']:
    assert needle in text, needle
settings = Path('V2RayEZ-GUI/src-tauri/src/settings.rs').read_text()
for needle in ['local-v2rayez', 'local://v2rayez', 'v2rayez-anti-dpi-local']:
    assert needle in settings, needle
process = Path('V2RayEZ-GUI/src-tauri/src/process.rs').read_text()
for needle in ['Starting V2RayEZ core', 'V2RayEZ core exited unexpectedly', 'V2RayEZ - {label}', 'Bundled V2RayEZ core adapter']:
    assert needle in process, needle
routing = Path('V2RayEZ-GUI/src-tauri/src/routing.rs').read_text()
for needle in ['V2RayEZ recovers', 'V2RayEZ is unavailable', 'V2RayEZ recovered']:
    assert needle in routing, needle
print('desktop V2RayEZ identity/static AI defaults pass')
PY
git diff --check
```

Result: PASS.

- `npm test --prefix V2RayEZ-GUI` passed 14/14 frontend tests.
- Static source assertions passed.
- `git diff --check` passed.

Blocked locally:

- Desktop Tauri/Rust native compile remains blocked because Rust/Cargo and native Tauri system dependencies are unavailable in this sandbox.

## Still Pending

- Real Windows installer/portable build.
- Real Linux native/package build.
- End-to-end connectivity and license validation on native desktop OS targets.
