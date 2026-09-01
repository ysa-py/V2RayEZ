# Milestone 19 Report — OpenWrt Package Source and Feature Consistency

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Reduce OpenWrt `.ipk` build risk by aligning the package Makefile with the current V2RayEZ Universal repository layout and the actual Rust feature names exposed by the donor daemon.

## Changes Applied

- Updated `MICAFP/openwrt/Makefile` package metadata:
  - Package version is now `2.0.0` to match V2RayEZ Universal release identity.
  - Maintainer/title/description now present V2RayEZ Universal while preserving the UnifiedShield/OpenWrt daemon pipeline as implementation provenance.
- Updated package source:
  - `PKG_SOURCE_URL` now points to `https://github.com/ysa-py/V2RayEZ.git`.
  - `PKG_SOURCE_VERSION` now points at the active Arena branch `arena/01a05e13-v2rayez` so OpenWrt SDK builds use the integrated V2RayEZ Universal source tree rather than a separate donor-only remote.
- Fixed the Rust feature mismatch:
  - Replaced nonexistent `--features openwrt` with the daemon's actual `--features platform-openwrt` feature.
- Made daemon/config path detection support both layouts:
  - V2RayEZ repository layout: `$(PKG_BUILD_DIR)/MICAFP/daemon` and `$(PKG_BUILD_DIR)/MICAFP/configs`.
  - Donor-source layout fallback: `$(PKG_BUILD_DIR)/daemon` and `$(PKG_BUILD_DIR)/configs`.

## Validation Run

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('MICAFP/openwrt/Makefile')
text = p.read_text()
checks = [
    'PKG_VERSION:=2.0.0',
    'PKG_SOURCE_URL:=https://github.com/ysa-py/V2RayEZ.git',
    'PKG_SOURCE_VERSION:=arena/01a05e13-v2rayez',
    '--features platform-openwrt',
    '$(PKG_BUILD_DIR)/MICAFP/daemon/Cargo.toml',
    'TITLE:=V2RayEZ Universal Router Gateway',
]
for needle in checks:
    assert needle in text, needle
assert '--features openwrt' not in text
assert 'MICAFP/UnifiedShield.git' not in text
print('openwrt makefile source/feature checks pass')
PY
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
gcc -std=gnu99 -Wall -Wextra -fsyntax-only -I MICAFP/openwrt/src \
  MICAFP/openwrt/src/main.c MICAFP/openwrt/src/netifd_proto.c
git diff --check
```

Result: PASS.

Observed:

- Package Makefile source/feature assertions PASS.
- OpenWrt shell syntax checks still PASS.
- OpenWrt C source syntax checks still PASS.
- `git diff --check` PASS.

## Still Pending

- Full OpenWrt `.ipk` compilation still needs a real OpenWrt SDK and Rust cross toolchain.
- The package source branch should be changed from the Arena branch to a stable tag/commit when V2RayEZ Universal is released.
