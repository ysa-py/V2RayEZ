# Milestone 29 Report — V2RayEZ User-Visible Runtime Wording

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Respond directly to the user's clarification: AetherGUI/Aethon UI/UX is not wanted. Donor capabilities remain, but visible product/runtime wording should say V2RayEZ wherever the user interacts with the app.

## Changes Applied

- Updated desktop/Tauri runtime status/error text:
  - `V2RayEZ core and System-wide VPN Mode are ready`
  - `V2RayEZ SOCKS5 proxy is ready`
  - V2RayEZ core wording for SOCKS listener failures and Windows cleanup errors.
- Updated Android runtime service log/error text:
  - V2RayEZ core log stream closed.
  - V2RayEZ core exited with code.
  - V2RayEZ core stopped unexpectedly.
- Updated desktop About-page static fallback HTML to say integrated networking adapters, not an Aether GUI identity.
- Updated Android English/Persian About strings:
  - Donor capabilities are described as running behind the V2RayEZ interface.
  - V2RayEZ Android interface is explicitly the product UI/UX.
- Kept internal class/binary/environment names where changing them would risk breaking donor networking adapters.

## Validation Run

```bash
npm test --prefix V2RayEZ-GUI
python3 - <<'PY'
import xml.etree.ElementTree as ET
for path in ['V2RayEZ-GUI/android/app/src/main/res/values/strings.xml','V2RayEZ-GUI/android/app/src/main/res/values-fa/strings.xml']:
    ET.parse(path)
print('android string xml parse pass')
PY
node --check tools/v2rayez_identity_gate.mjs
node tools/v2rayez_identity_gate.mjs
python3 - <<'PY'
from pathlib import Path
checks = {
'V2RayEZ-GUI/src-tauri/src/lib.rs':['V2RayEZ core and System-wide VPN Mode are ready','V2RayEZ SOCKS5 proxy is ready','V2RayEZ core did not open its SOCKS5 listener'],
'V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/AetherVpnService.java':['V2RayEZ core log stream closed','V2RayEZ core exited with code','V2RayEZ core stopped unexpectedly'],
'V2RayEZ-GUI/android/app/src/main/res/values/strings.xml':['Integrated donor capabilities','product UI/UX; donor capabilities run behind it'],
'V2RayEZ-GUI/android/app/src/main/res/values-fa/strings.xml':['قابلیت‌های اهدایی ادغام‌شده','UI/UX محصول'],
}
for path, needles in checks.items():
    text = Path(path).read_text()
    for needle in needles:
        assert needle in text, f'{path}: {needle}'
print('V2RayEZ user-visible wording checks pass')
PY
git diff --check
```

Result: PASS.

- V2RayEZ GUI frontend tests passed 14/14.
- Android string XML parsing passed.
- Identity gate passed.
- Static wording assertions passed.

## Scope Note

This milestone is wording/UI-surface cleanup only. It does not remove Aether/MSN donor networking capabilities, adapters, class names, binaries, or legal/provenance notices that are needed for feature preservation and compatibility.
