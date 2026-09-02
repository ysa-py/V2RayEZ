# Milestone 11 Report — OpenWrt netifd Integration and C Source Repair

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Goal

Continue automatically on the mandatory OpenWrt target by adding the missing first-class netifd protocol integration and repairing orphaned OpenWrt C source issues that were visible without the OpenWrt SDK.

## Changes Applied

- Added `/lib/netifd/proto/unifiedshield.sh` package payload at `MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh`.
  - Registers `proto unifiedshield` with netifd.
  - Reads interface/UCI values for enabled state, TUN name, IP/prefix, MTU, DNS, server, core, kill switch, and split tunnel.
  - Fails closed if the license gate denies service start.
  - Starts/stops the procd service through netifd setup/teardown.
  - Publishes IP/DNS interface state back to netifd.
- Updated `MICAFP/openwrt/Makefile`:
  - Adds `+netifd` dependency.
  - Installs the netifd protocol script.
- Recreated the OpenWrt procd init script payload under `MICAFP/openwrt/files/etc/init.d/unifiedshield` so the Makefile install stanza has a real source file.
- Added missing C headers:
  - `MICAFP/openwrt/src/netifd_proto.h`
  - `MICAFP/openwrt/src/uci_config.h`
- Repaired obvious C/C++ mismatches in OpenWrt source:
  - Replaced `nullptr` with `NULL`.
  - Added missing standard includes for `uint32_t`, `select`, and C booleans.
  - Used the `verbose` CLI flag to set the syslog mask, removing an unused-variable warning.

## Validation Run

```bash
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
grep -R "nullptr" -n MICAFP/openwrt/src || true
gcc -std=gnu99 -Wall -Wextra -fsyntax-only -I MICAFP/openwrt/src \
  MICAFP/openwrt/src/main.c MICAFP/openwrt/src/netifd_proto.c
grep -n "lib/netifd/proto/unifiedshield.sh" MICAFP/openwrt/Makefile
git diff --check
```

Result: PASS.

Observed:

- OpenWrt init, license gate, and netifd protocol shell syntax PASS.
- No `nullptr` remains in OpenWrt C sources.
- `main.c` and `netifd_proto.c` parse with GCC syntax checks locally.
- Package Makefile installs `lib/netifd/proto/unifiedshield.sh`.
- `git diff --check` PASS.

## Still Pending

- Full `.ipk` build still requires the OpenWrt SDK/toolchain, which is unavailable in this sandbox.
- Runtime netifd/LuCI testing still requires an OpenWrt rootfs/router.
- The Rust daemon/native license verifier still requires Rust/Cargo target toolchains.
