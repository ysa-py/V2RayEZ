# Milestone 9 Report — V2RayEZ-GUI Path and Legacy Brand Removal

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Goal

Apply the user’s repeated correction at repository/source-tree level, not only inside visible desktop strings: the GUI must be **V2RayEZ GUI**, and the old donor GUI identity must not remain as the working product path or runtime UI.

## Changes Applied

- Renamed the imported desktop GUI source tree to `V2RayEZ-GUI/`.
- Updated all repository references from the former donor directory name to `V2RayEZ-GUI/`.
- Rebranded the Android companion code inside `V2RayEZ-GUI/android/` so it no longer exposes the old donor GUI identity:
  - Android namespace/application id: `app.v2rayez.gui`.
  - Java package: `app.v2rayez.gui`.
  - Quick Settings tile service: `V2RayEZTileService`.
  - Launcher/tile drawable reference: `ic_v2rayez_mono`.
  - User-visible Android strings: V2RayEZ/V2RayEZ VPN.
  - Update repository/API/download URLs: `ysa-py/V2RayEZ`.
- Updated `tools/merge_inventory.py` and regenerated `MERGE_INVENTORY.json` so feature probes use `V2RayEZ-GUI/` and the new Android package paths.
- Updated docs/reports to state that the shipped GUI is V2RayEZ and the Aether name is only an engine-adapter reference.

## Validation Run

```bash
cd V2RayEZ-GUI
node --check src/app.js
node --check src/i18n.js
node --check tests/frontend.test.mjs
npm test
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri config json pass')"

cd ..
python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET
for p in [Path('V2RayEZ-GUI/android/app/src/main/res/values/strings.xml'), Path('V2RayEZ-GUI/android/app/src/main/res/values-fa/strings.xml'), Path('V2RayEZ-GUI/android/app/src/main/AndroidManifest.xml')]:
    ET.parse(p)
    print('xml pass', p)
PY
python3 tools/merge_inventory.py
grep -R -i "firstham\|hamvex\|aethon\|aethergui\|aether-gui\|com.firstham" -n V2RayEZ-GUI --exclude-dir=target --exclude-dir=node_modules --exclude='*.png' --exclude='*.ico' --exclude='*.icns'
git diff --check
```

Result: PASS.

Observed:

- V2RayEZ desktop GUI static tests PASS — 14/14.
- Tauri config JSON parse PASS.
- V2RayEZ-GUI Android XML parse PASS for manifest, English strings, and Persian strings.
- `V2RayEZ-GUI/` case-insensitive grep for legacy donor GUI/user/channel/package identifiers returned no matches.
- No root directory beginning with the old donor GUI name remains.
- `MERGE_INVENTORY.json` regenerated successfully with 8 sources and 27 feature probes.
- `git diff --check` PASS.

## Remaining Toolchain Blockers

- Native Android/Gradle builds still require Java/JDK and Android SDK.
- Rust/Tauri builds still require Rust/Cargo and platform toolchains.
- Windows `.exe`/portable builds require a Windows runner/MSVC/Tauri toolchain.
- iOS `.ipa` requires macOS/Xcode/signing/Network Extension entitlements.
- OpenWrt `.ipk` requires OpenWrt SDK/toolchain.
