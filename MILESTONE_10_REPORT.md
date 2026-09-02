# Milestone 10 Report — OpenWrt LuCI Packaging Preservation Pass

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Goal

Continue fully automatically after the V2RayEZ GUI correction by addressing the OpenWrt packaging preservation risk: the package Makefile needed to explicitly install all LuCI models/templates/ACL/config assets, not only the newest controller and one CBI page.

## Changes Applied

- Updated `MICAFP/openwrt/Makefile` to install preserved LuCI assets:
  - Controller: `luci/controller/unifiedshield.lua`.
  - Model helper: `luci/model/unifiedshield.lua`.
  - Legacy/top-level CBI model: `luci/model/cbi/unifiedshield.lua`.
  - New nested License/AI CBI model: `luci/model/cbi/unifiedshield/config.lua`.
  - Status template: `luci/view/unifiedshield/status.htm`.
  - Advanced resilience/AI/mesh template: `luci/view/unifiedshield/advanced.htm`.
  - rpcd ACL: `/usr/share/rpcd/acl.d/luci-app-unifiedshield.json`.
  - Preserved Iran IP range config asset: `/etc/unifiedshield/iran_ip_ranges.txt`.
- Added `MICAFP/openwrt/files/usr/share/rpcd/acl.d/luci-app-unifiedshield.json`.
- Updated the LuCI controller to route to real templates for Status and Advanced, while retaining JSON/API endpoints.
- Added API-compatible LuCI endpoints for the status template and advanced view:
  - `/admin/services/unifiedshield/api/status`
  - `/admin/services/unifiedshield/api/start`
  - `/admin/services/unifiedshield/api/stop`
  - `/admin/services/unifiedshield/api/restart`
  - `/admin/services/unifiedshield/api/resilience`
  - `/admin/services/unifiedshield/api/log`
- Converted the preserved advanced view from dashboard-style include syntax to LuCI template syntax and changed its AJAX target from `/api/resilience` to the LuCI route.

## Validation Run

```bash
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
python3 -m json.tool MICAFP/openwrt/files/usr/share/rpcd/acl.d/luci-app-unifiedshield.json >/dev/null
grep -n "view/unifiedshield/status.htm\|view/unifiedshield/advanced.htm\|luci-app-unifiedshield.json\|model/unifiedshield.lua\|model/cbi/unifiedshield.lua\|iran_ip_ranges.txt" MICAFP/openwrt/Makefile
python3 - <<'PY'
from pathlib import Path
checks = {
    Path('MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/controller/unifiedshield.lua'): [
        '{"admin", "services", "unifiedshield", "api", "resilience"}',
        'template("unifiedshield/advanced")',
        'template("unifiedshield/status")',
        'function action_api_resilience()'
    ],
    Path('MICAFP/openwrt/files/usr/lib/lua/luci/view/unifiedshield/advanced.htm'): [
        'admin/services/unifiedshield/api/resilience',
        '<%+header%>',
        '<%+footer%>'
    ],
}
for path, needles in checks.items():
    text=path.read_text()
    for needle in needles:
        assert needle in text, (path, needle)
    print('openwrt static pass', path)
PY
git diff --check
```

Result: PASS after correcting the static assertion to check the LuCI table route representation.

## Toolchain Availability Attempt

I also attempted to install missing toolchains automatically:

```bash
sudo apt-get update && sudo apt-get install -y openjdk-17-jdk-headless cargo rustc golang-go lua5.4
```

Result: BLOCKED by Debian mirror connectivity failures (`deb.debian.org` connection failed), so Java/Rust/Go/Lua native builds remain unavailable in this sandbox.

## Still Pending

- OpenWrt `.ipk` build still requires an OpenWrt SDK/toolchain.
- Lua/LuCI runtime parse and router runtime tests still require an OpenWrt rootfs or router.
- Native V2RayEZ license verifier binary for OpenWrt still requires Rust/Cargo and target toolchains.
