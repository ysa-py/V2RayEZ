# Milestone 17 Report — OpenWrt LuCI Serial Install Controls

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Goal

Make the OpenWrt LuCI license flow operational from the V2RayEZ router UI instead of requiring manual SSH-only serial installation, while preserving fail-closed behavior and avoiding serial disclosure in UCI.

## Changes Applied

- Rebranded the OpenWrt CBI page title to `V2RayEZ Universal` while preserving donor pipeline wording in descriptive text for traceability.
- Added protected serial installation control to `MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua`:
  - New `_license_serial` text field accepts a signed V2RayEZ serial.
  - The serial is written to `/etc/unifiedshield/license.token`.
  - File permissions are forced to `0600`.
  - The serial is never written into UCI and `cfgvalue()` always returns an empty string so LuCI never echoes it back.
- Added `_license_clear_serial` button:
  - Removes `/etc/unifiedshield/license.token`.
  - Removes `/etc/unifiedshield/license.grace`.
  - Updates UCI license status to `DENIED` / `serial_cleared`.
- Updated serial storage help text to show the LuCI paste flow and retain the manual file path as a fallback.

## Validation Run

```bash
python3 - <<'PY'
from pathlib import Path
path = Path('MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua')
text = path.read_text()
for needle in ['_license_serial', 'license_token_file', 'fs.writefile(license_token_file', 'util.shellquote', '_license_clear_serial']:
    assert needle in text, needle
assert 'LuCI never displays the serial value' in text
print('openwrt cbi license serial controls pass')
PY
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
git diff --check
```

Result: PASS.

Observed:

- Static checks confirm the LuCI CBI serial install/clear controls are present and intentionally non-echoing.
- License gate and netifd protocol shell syntax still PASS.
- `git diff --check` PASS.

## Still Pending

- Runtime LuCI validation still requires an OpenWrt LuCI runtime/rootfs.
- Full `.ipk` build still requires an OpenWrt SDK/toolchain.
