# V2RayEZ Universal — Consolidated Third-Party Notices

**Milestone:** 0 consolidation baseline  
**Date:** 2026-09-01

This file consolidates third-party attribution discovered in the donor source trees. It must be kept up to date whenever binaries, fonts, protocol cores, browser-extension dependencies, workers, or packaging assets are bundled into V2RayEZ Universal.

> This is a preservation notice, not a final legal audit. Before release, verify every version, checksum, redistribution permission, and transitive dependency license in CI/release review.

---

## Required notices carried forward

### Xray-core

- Version found in donor notices: `v26.7.28`
- Commit found in donor notices: `5ca6f4b7d4dc20a881d4330e498892697627ec0c`
- Purpose: Xray/V2Ray protocol engine for VLESS, VMess, Trojan, Shadowsocks, WebSocket/TLS, REALITY/finalmask-style routes where configured.
- License: MPL-2.0
- Upstream: <https://github.com/XTLS/Xray-core>
- Donor license file: `UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app/third_party/xray-LICENSE.txt`
- Donor notice: `UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app/THIRD_PARTY_NOTICES.md`

Bundled Android executable hashes from donor notice:

```text
arm64-v8a   BA33E8A5518353DB9F5DEC80B3A4133063C3F5F71EB8E64D99DED4FA9DC0F458
armeabi-v7a FB910409903B4AF3A3A673489C27C99398C7D7A3C02C496ECD87698FF50EA735
x86_64      494154A10429A43494D14AC1A78F44870206121D6E8AFBEE6ED94CF3CF68999A
```

### Vazirmatn UI FD font

- Purpose: Persian UI typography and Farsi digits.
- License: SIL Open Font License 1.1.
- Upstream: <https://github.com/rastikerdar/vazirmatn>
- Donor license file: `UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app/third_party/vazirmatn-OFL.txt`
- Bundled resource paths include `.../app/src/main/res/font/vazirmatn_ui_fd_*.ttf` and UAC-Windows font assets.

### flag-icons / FlagCDN

- Purpose: ISO country flags shown in country/exit/config-maker UI.
- License: MIT.
- Upstream: <https://github.com/lipis/flag-icons>
- Distribution endpoint: <https://flagcdn.com/>
- Donor license file: `UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app/third_party/flag-icons-LICENSE.txt`

### hev-socks5-tunnel

- Purpose: lightweight TUN-to-SOCKS bridge used by Tor and related device tunnel paths.
- License: MIT.
- Upstream: <https://github.com/heiher/hev-socks5-tunnel>
- Donor license files:
  - `UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app/third_party/hev-socks5-tunnel-LICENSE.txt`
  - `V2RayEZ-GUI/third-party/hev-socks5-tunnel-LICENSE.txt`
- Aether donor notice states Android routing uses HEV Socks5 Tunnel v2.16.0.

---

## Donor project licenses and notices

### V2RayEZ base

- Source root: `V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/`
- License file: `LICENSE`
- Includes Android `libv2ray.aar` and native addon packs in `app/src/main/jniLibs/`; each bundled core must retain its upstream license notice.

### AetherGUI / Aethon donor material (not final GUI identity)

- Source root: `V2RayEZ-GUI/`
- License file: `LICENSE`
- Notice file: `NOTICE.md`
- Donor notice summary:
  - AetherGUI/Aethon donor material is preserved for license/notice traceability only; V2RayEZ is the final GUI identity.
  - Bundles Aether executable from `CluvexStudio/Aether`.
  - Aether is licensed under GNU AGPL v3.0.
  - Donor README indicates target integrated Aether core: v1.7.0; donor notice still mentions older v1.5.0 and must be updated during release after exact bundled version/checksum is confirmed.
  - System-wide VPN Mode bundles sing-box from SagerNet under GPL-3.0-or-later.
  - Android update flow verifies SHA-256 and signing certificate.
- Additional donor license files:
  - `third-party/sing-box-LICENSE.txt`
  - `third-party/hev-socks5-tunnel-LICENSE.txt`

### EasySNI

- Source root: `EasySNI- Make sure to fully add all features to the V2RayEZ app/`
- License file: `LICENSE`
- License discovered: MIT License, copyright 2026 Amin Mahmoudi.
- Third-party/runtime components to audit and preserve when bundled:
  - Xray
  - sing-box
  - Tor
  - Psiphon
  - WinDivert (`WinDivert.dll`, `WinDivert64.sys` present)
  - SPlus/LiveKit optional dependencies
  - BPB/EdgeTunnel worker assets
  - Google Apps Script / Cloudflare Worker generated assets

### MICAFP-UnifiedShield

- Source root: `MICAFP/`
- License files discovered in repository root and submodules must be audited before release.
- Third-party/runtime components referenced by source tree:
  - hiddify-core
  - GFW-knocker/Xray-core Mahsa fork
  - sing-box
  - AmneziaVPN / awg-go
  - DefyxVPN
  - MoaV
  - Lantern
  - MahsaNG
  - Psiphon fork
  - Tor/pluggable transports
  - libp2p/I2P/Yggdrasil dependencies
  - ONNX runtime and Python ML stack
  - Next.js/React/dashboard dependencies
  - browser extension and WASM dependencies
- Before release, generate a transitive SBOM for Rust, Go, Python, npm, Gradle, CocoaPods/SwiftPM, and OpenWrt packages.

### MSN-GUARD

- Source root: `MSN-GUARD- Make sure to fully add all features to the V2RayEZ app/`
- License files:
  - `LICENSE`
  - `core/LICENSE`
  - `core/quiche/**/COPYING`
- Contains Aether core and QUIC/quiche-related components.
- Includes Psiphon Android AAR and badvpn/lwIP/tun2socks pieces; preserve upstream copyright statements in source files and packages.

### UAC-SNI-Spoofer Android

- Source root: `UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app/`
- Third-party notice file: `THIRD_PARTY_NOTICES.md`
- Third-party license files:
  - `third_party/xray-LICENSE.txt`
  - `third_party/flag-icons-LICENSE.txt`
  - `third_party/vazirmatn-OFL.txt`
  - `third_party/hev-socks5-tunnel-LICENSE.txt`
- Native runtime components in `app/src/main/jniLibs/*` include Tor, WebTunnel, Xray, and hev-socks5-tunnel libraries.

### UAC-SNI-Spoofer Windows

- Source root: `UAC-SNI-Spoofer-Windows- Make sure to fully add all features to the V2RayEZ app/`
- License file: `LICENSE`
- Notice file: `NOTICE`
- Donor notice summary:
  - Copyright 2026 Floxu1.
  - Licensed under GNU GPL v3.0.
  - Includes credits and upstream references to Patterniha group.
  - `Powered by Patterniha` credit must not be removed.
  - Patterniha source/license files must remain under `third_party/patterniha_sni_spoofing/` or equivalent attribution path.
  - sing-box v1.13.14 bundled for optional Windows TUN mode; license shipped by donor as `bin/sing-box-LICENSE`.
- Additional license file: `third_party/patterniha_sni_spoofing/LICENSE`

### MasterDnsVPN

- Source root: `MasterDnsVPN-main/`
- License file: `LICENSE`
- License discovered: MIT License, copyright 2026 Macan Developer.
- Docker/server/client packaging notices must preserve this license in all redistributed binaries and images.

---

## Release audit TODO gate

The final release must not ship until this checklist is complete:

- [ ] Generate SPDX/SBOM for all ecosystems used: Gradle, Cargo, Go modules, npm, Python, CocoaPods/SwiftPM, OpenWrt packages.
- [ ] Verify Aether exact version and checksum; update Aether notice if v1.7.0 is bundled.
- [ ] Verify sing-box exact version(s), checksums, and GPL obligations.
- [ ] Verify Tor, Psiphon, obfs4, Lyrebird, Snowflake, WebTunnel, WARP-related component licensing.
- [ ] Verify WinDivert/Npcap redistribution terms for Windows installer and portable package.
- [ ] Verify every bundled native binary checksum and source offer requirement.
- [ ] Keep MPL/GPL/AGPL/copyleft source obligations visible in the app About/Notices screen and release assets.
- [ ] Add this file to Android assets/About screen, iOS Settings/About, Windows About, Linux package docs, OpenWrt LuCI About, and dashboard footer.
