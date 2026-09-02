# Milestone 34 Report — OpenWrt Source Pin and SDK .ipk Builder

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Move OpenWrt packaging closer to a real universal/generic LuCI `.ipk` release flow without fabricating artifacts in the sandbox. The package must use a reproducible source commit instead of a moving branch and the build wrapper must require a real target-specific OpenWrt SDK.

## Changes Applied

- Pinned `MICAFP/openwrt/Makefile` source checkout:
  - `PKG_SOURCE_VERSION` changed from the moving `arena/01a05e13-v2rayez` branch to validated commit `5263aebfdc4673bba8cd56049de26ae3dd7509e3`.
  - Added a Makefile comment requiring source-gate validation before refreshing the pin.
- Replaced the old non-SDK `MICAFP/scripts/package-openwrt.sh` loop with an SDK-based `.ipk` builder:
  - accepts `--sdk` or `OPENWRT_SDK`.
  - accepts `--out-dir`, `--jobs`, and `--check`.
  - validates required OpenWrt package files, LuCI package metadata, license gate, runtime license watchdog, AI provider test script, and pinned source commit.
  - refuses to build when the OpenWrt SDK is absent or invalid.
  - stages the package under `package/network/services/unifiedshield` inside the SDK.
  - runs `make defconfig`, `make package/unifiedshield/clean`, and `make package/unifiedshield/compile V=s`.
  - copies built `*unifiedshield*.ipk` files to `artifacts/openwrt` by default and writes `SHA256SUMS`.
- Added `tools/openwrt_packaging_gate.mjs` to statically enforce:
  - full 40-character commit SHA pinning.
  - no moving branch as `PKG_SOURCE_VERSION`.
  - watchdog install wiring.
  - real OpenWrt SDK/package compile wrapper behavior.
- Added the new gate and script `--check` mode to the CI sample workflow.

## Validation Run

```bash
bash -n MICAFP/scripts/package-openwrt.sh
MICAFP/scripts/package-openwrt.sh --check
node --check tools/openwrt_packaging_gate.mjs
node tools/openwrt_packaging_gate.mjs
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node --check tools/android_ai_settings_migration_gate.mjs
node tools/android_ai_settings_migration_gate.mjs
node --check tools/v2rayez_identity_gate.mjs
node tools/v2rayez_identity_gate.mjs
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-watchdog.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
npm test --prefix V2RayEZ-GUI
git diff --check
```

Result: PASS.

## Scope Note

This milestone does not claim a generated `.ipk`; it deliberately prevents fake packaging when the target OpenWrt SDK/toolchain is missing. Real `.ipk` generation remains blocked locally until a target-specific OpenWrt SDK is mounted/provided.
