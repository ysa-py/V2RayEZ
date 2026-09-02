# OpenWrt Build - LuCI .ipk (not raw binary archive)

This directory now produces **installable LuCI-compatible .ipk packages**, not raw binary archives.

## Outputs

- `unifiedshield_<version>-1_mipsel_24kc.ipk` - Most common MIPS routers (TP-Link, D-Link, etc.)
- `unifiedshield_<version>-1_aarch64_cortex-a53.ipk` - ARM routers (NanoPi, etc.)
- `unifiedshield_<version>-1_x86_64.ipk` - x86 routers and VMs
- `luci-app-unifiedshield_<version>-1_all.ipk` - LuCI web interface (all archs)

All IPKs are LuCI-compatible and installable via `opkg`.

## Build Pipeline (GitHub Actions)

Job `build-openwrt` in `release.yml` runs on `ubuntu-latest` with matrix:

```yaml
matrix:
  include:
    - openwrt_target: mipsel_24kc
      rust_target: mipsel-unknown-linux-musl
      arch: mipsel_24kc
    - openwrt_target: aarch64_cortex-a53
      rust_target: aarch64-unknown-linux-musl
      arch: aarch64_cortex-a53
    - openwrt_target: x86_64
      rust_target: x86_64-unknown-linux-musl
      arch: x86_64
```

Steps:

1. Cache OpenWrt SDK (23.05.5) per target
2. Install build deps: `build-essential`, `libncurses-dev`, `libssl-dev`, etc.
3. Download core libs (`mipsel-unknown-linux-musl`, `aarch64-unknown-linux-musl`, `x86_64-unknown-linux-musl`) built with `opt-level=z`, `lto=true`, `panic=abort`
4. Attempt SDK build:
   ```bash
   bash scripts/build-openwrt-ipk.sh --target mipsel_24kc --rust-target mipsel-unknown-linux-musl --out-dir dist-openwrt
   ```
   - Downloads SDK from `downloads.openwrt.org` (cached)
   - Copies package feed from `MICAFP/openwrt` or minimal `universal-core/openwrt`
   - Runs `make package/unifiedshield/compile V=s -j$(nproc)`
5. Fallback manual IPK creation if SDK fails:
   ```bash
   bash universal-core/openwrt/build-ipk.sh --arch mipsel_24kc --rust-target mipsel-unknown-linux-musl --out-dir dist-openwrt --version 2.0.0
   ```
   - Creates `control.tar.gz`, `data.tar.gz`, `debian-binary`
   - Packages via `ar r unifiedshield_*.ipk debian-binary control.tar.gz data.tar.gz`
   - Includes LuCI controller, CBI model, ACL, init script, config
6. Generate SHA256SUMS.txt

## IPK Structure

Each IPK contains:

- `/usr/bin/v2rayez-license-gate` - License gate binary (Ed25519 verification)
- `/usr/bin/unifiedshield` - Symlink/copy of gate binary for procd
- `/etc/config/unifiedshield` - UCI config
- `/etc/init.d/unifiedshield` - procd init script (START=99, respawn)
- `/usr/lib/lua/luci/controller/unifiedshield.lua` - LuCI controller
- `/usr/lib/lua/luci/model/cbi/unifiedshield.lua` - CBI form
- `/usr/share/rpcd/acl.d/luci-app-unifiedshield.json` - ACL
- `postinst` / `prerm` - Enable/disable service on install/remove

## Local Build

```bash
# Build core for OpenWrt
./universal-core/ci/build-target.sh mipsel-unknown-linux-musl "std,post-quantum-lab"
./universal-core/ci/build-target.sh aarch64-unknown-linux-musl "std,post-quantum-lab"
./universal-core/ci/build-target.sh x86_64-unknown-linux-musl "std,post-quantum-lab"

# Build IPK (SDK)
bash scripts/build-openwrt-ipk.sh --target mipsel_24kc --out-dir dist-openwrt

# Or manual fallback (no SDK needed)
bash universal-core/openwrt/build-ipk.sh --arch mipsel_24kc --out-dir dist-openwrt --version 2.0.0
ls dist-openwrt/*.ipk
```

## Installation on Router

```sh
opkg update
opkg install unifiedshield_2.0.0-1_mipsel_24kc.ipk
opkg install luci-app-unifiedshield_2.0.0-1_all.ipk
/etc/init.d/unifiedshield enable
/etc/init.d/unifiedshield start
# Then configure via LuCI -> Services -> V2RayEZ
```

## Preserved Features

- All existing OpenWrt targets kept (mipsel, aarch64, x86_64)
- Optimized flags: `opt-level=z`, `lto=true`, `panic=abort`, `crt-static`
- LuCI integration preserved
- License gating + AI provider fallback
