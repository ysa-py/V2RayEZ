# V2RayEZ Universal — Milestone 0 Merge Traceability

**Date:** 2026-09-01  
**Branch:** `arena/01a05e13-v2rayez`  
**Milestone status:** started; inventory and traceability baseline created.  
**Implementation status vocabulary:**

- `preserved`: donor source is present in this checkout and mapped to a target home; not necessarily integrated yet.
- `ported`: implementation has been moved into the canonical target component.
- `wrapped`: implementation remains as a sidecar/library but is controlled through the unified Rust core API.
- `merged`: feature is fully integrated into V2RayEZ Universal and passes required tests.
- `superseded-with-equivalent`: donor behavior is fully covered by a more complete target implementation and has tests proving equivalence.
- `blocked`: implementation or validation cannot proceed without a missing source/toolchain/credential/hardware dependency.

> **Important:** This document is a traceability baseline, not a completion claim. Any row marked `preserved` still requires implementation, platform wiring, builds, and E2E traffic validation before it may become `merged`.

---

## 1) Source roots discovered

The repeatable inventory tool is `tools/merge_inventory.py`; generated output is `MERGE_INVENTORY.json`.

| Source | Path | Files discovered | Top-level areas | Status |
|---|---|---:|---|---|
| V2RayEZ base | `V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/` | 294 | `.github`, `app`, `gradle`, `scripts` | preserved |
| V2RayEZ-GUI / Aether adapter donor | `V2RayEZ-GUI/` | 171 | `.github`, `android`, `docs`, `scripts`, `src`, `src-tauri`, `tests`, `third-party` | donor behavior preserved; not final GUI identity |
| EasySNI | `EasySNI- Make sure to fully add all features to the V2RayEZ app/` | 103 | `Configs`, `docs`, `internal`, `repo` | preserved |
| MICAFP-UnifiedShield | `MICAFP/` | 690 | `ai-models`, `android`, `app`, `configs`, `core`, `daemon`, `dashboard`, `extensions`, `ios`, `linux`, `openwrt`, `workers`, etc. | preserved |
| MSN-GUARD | `MSN-GUARD- Make sure to fully add all features to the V2RayEZ app/` | 939 | `.github`, `app`, `core`, `docs`, `gradle`, `tools` | preserved |
| UAC-SNI-Spoofer Android | `UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app/` | 488 | `app`, `gradle`, `scripts`, `third_party` | preserved |
| UAC-SNI-Spoofer Windows | `UAC-SNI-Spoofer-Windows- Make sure to fully add all features to the V2RayEZ app/` | 165 | `artifacts`, `assets`, `docs`, `tests`, `third_party`, `tools`, `uac_desktop`, `wizard guider` | preserved |
| MasterDnsVPN | `MasterDnsVPN-main/` | 164 | `.github`, `assets`, `cmd`, `docker`, `internal`, `scripts` | preserved |

---

## 2) Target architecture map

| Target component | Purpose | Inputs mapped here | Required platforms |
|---|---|---|---|
| `universal-core/` | Canonical Rust orchestration core: license gate, transport selection, core lifecycle, config parsing, AI routing, telemetry scrub, metrics, IPC/FFI | MICAFP daemon/core, Aether, MSN-GUARD JNI behavior, UAC adaptive routing, DNS tunnel port/wrapper | Android, iOS, Windows, Linux, OpenWrt |
| `universal-core/engines/aether/` | Single Aether v1.7.0 engine adapter used by V2RayEZ-GUI Aether-adapter donor behavior and MSN-GUARD feature sets behind V2RayEZ GUI | V2RayEZ-GUI `src-tauri`, MSN-GUARD `core/aether` | Android, Windows, Linux/iOS where portable |
| `universal-core/transports/dns-tunnel/` | First-class MasterDnsVPN DNS request/response transport | MasterDnsVPN `cmd`, `internal`, configs, installer/docker | Android, iOS, Windows, Linux, OpenWrt |
| `universal-core/config/` | Round-trip config parser/editor/exporter | V2RayEZ parser/builders, UAC profile parsers, EasySNI protocol/xray config tools, MICAFP schema | All platforms |
| `universal-core/adaptive-routing/` | Carrier/ASN/network fingerprinting, route racing, Champion/Backup caches, cooldowns | UAC Android, UAC Windows, MICAFP AI route selectors/ISP profiles | All platforms |
| `universal-core/obfuscation/` | Anti-DPI and obfuscation engines | MICAFP obfuscation, EasySNI desync, Aether noize/uTLS, UAC fragment tools | All platforms + Browser WASM |
| `universal-core/fronting/` | Domain fronting, MITM local proxy control, host→front rules, CDN reachability strategy | V2RayEZ MITM/fronting, EasySNI `mitmdf`/`sni`, MICAFP CDN transports/configs | Android, Windows, Linux, OpenWrt, Browser companion |
| `apps/android/` | V2RayEZ Android app with preserved Compose UI/UX and JNI bridge | Base V2RayEZ Android + MSN/UAC/MICAFP/Aether Android code | Android APK |
| `apps/ios/` | Swift app + Packet Tunnel Provider | MICAFP iOS code + universal core XCFramework | iOS IPA |
| `apps/windows/` | V2RayEZ Tauri GUI + wrapped Python tools + native core | V2RayEZ-GUI Aether-adapter donor Tauri behavior, UAC Windows Python, EasySNI/WinDivert, MICAFP Windows | Windows EXE + portable |
| `packages/linux/` | Linux daemon/binary/package/systemd | MICAFP Linux + EasySNI/MasterDnsVPN sidecars | Linux |
| `packages/openwrt/` | OpenWrt daemon/IPK/LuCI/UCI/netifd | MICAFP OpenWrt + DNS tunnel server/client tooling | OpenWrt generic IPK |
| `dashboard/` | Control-plane + separate License Admin/Issuer surface | MICAFP Next.js dashboard + new license APIs/schema | Server/Web |
| `extensions/` | Chrome/Firefox companion extensions | MICAFP extensions/shared + wasm-obfuscator | Chrome, Firefox |
| `workers/` | CDN/domain-front relay deployables | MICAFP workers + EasySNI BPB/EdgeTunnel/GTunnel assets | Cloudflare, Alibaba, Tencent, Huawei, Baidu, ByteDance, Arvan, Deno |
| `ai-models/` | Training and quantization pipeline | MICAFP `ai-models/` | Developer/CI/model supply |
| `docs/` | API docs, DNS tunnel setup, architecture, test evidence, notices | All donors | All deliverables |

---

## 3) V2RayEZ base feature map

| Feature | Source paths | Target home | Platforms | Status |
|---|---|---|---|---|
| Kotlin/Compose/Hilt/Room/DataStore Android app shell | `.../app/src/main/java/com/v2rayez/app`, `.../app/build.gradle.kts` | `apps/android/` | Android | preserved |
| Xray core and protocols VLESS/VMess/Trojan/Shadowsocks | `.../app/libs/libv2ray.aar`, `data/core/ConfigBuilder.kt`, `data/core/V2RayCore.kt`, `data/core/XrayProxyCore.kt` | `universal-core/config`, `universal-core/engines/xray`, Android bridge | All | preserved |
| Import share link, QR, file, text, subscriptions | `data/parser/ProxyParser.kt`, `ui/components/QrScanner.kt`, `data/work/SubscriptionRefreshWorker.kt`, server UI | `universal-core/config`, app UIs | All | preserved |
| Per-app proxy and tunnel policy | `data/vpn/PerAppTunnelPolicy.kt`, `ui/screens/settings/AdvancedVpnScreen.kt` | `universal-core/tunnel-policy`, `apps/android` | Android, iOS where supported, Windows/Linux app bypass | preserved |
| Iran routing and Geo assets | `data/core/IranRouting.kt`, `GeoAssetManager.kt`, `IranGeoAutoConfigurator.kt` | `universal-core/geo-routing` | All | preserved |
| In-app browser | `ui/screens/browser/BrowserScreen.kt`, `ui/viewmodel/BrowserViewModel.kt` | `apps/android` and optional desktop shell | Android | preserved |
| MITM/domain-fronting tools | `data/mitm`, `data/fronting`, `ui/screens/mitm`, `ui/screens/tools/DomainFrontingScreen.kt` | `universal-core/fronting`, `apps/* tools` | Android, Windows, Linux | preserved |
| Core Manager/addon packs | `data/core/AddonPackManager.kt`, `PackInstallCoordinator.kt`, `scripts/addon-vendor-sources.json` | `universal-core/core-manager` | All | preserved |
| Tor and pluggable transports | `data/tor`, `assets/tor`, JNI libs | `universal-core/transports/tor`, `apps/android` | Android, Windows, Linux, OpenWrt | preserved |
| ByeDPI/sing-box/mihomo/lyrebird/snowflake/webtunnel native packs | `app/src/main/jniLibs/*` | `universal-core/core-manager` | Android initially; portable where possible | preserved |
| Foreground service, Quick Settings, boot auto-connect | `data/service/V2RayVpnService.kt`, `V2RayTileService.kt`, `BootReceiver.kt` | `apps/android` lifecycle | Android | preserved |
| Widgets | `data/widget/*`, `res/layout/widget_*`, `res/xml/widget_*` | `apps/android/widgets` | Android | preserved |
| Hotspot/local share | `ui/screens/hotspot/HotspotShareScreen.kt` | `apps/android`, `apps/windows` Mobile Gateway parity | Android, Windows | preserved |
| Warp screen/registration | `data/warp/WarpRegistrar.kt`, `ui/screens/warp/WarpScreen.kt` | `universal-core/transports/warp`, UI | Android, Windows/Linux where supported | preserved |
| BPB panel UI | `ui/screens/tools/BpbPanelScreen.kt` | `universal-core/deployers/bpb`, UI | Android, Windows, Linux | preserved |
| Crash/stability fixes and telemetry scrubbing | `data/analytics/PiiScrubber.kt`, `FirebaseTelemetry.kt`, release notes | `universal-core/telemetry`, app shell | All | preserved |
| Localization EN/FA/RU and QA gate | `res/values*/strings.xml`, `scripts/gates/string-key-parity.sh` | CI + app resources | All UI surfaces | preserved; gate passed baseline |

---

## 4) V2RayEZ-GUI / Aether adapter donor feature map (not the final GUI)

| Feature | Source paths | Target home | Platforms | Status |
|---|---|---|---|---|
| Aether v1.7.0 integration | `README.md`, `src-tauri/src/settings.rs`, Android Aether service | `universal-core/engines/aether` | Android, Windows | preserved |
| Tauri Windows shell | `src-tauri/Cargo.toml`, `src-tauri/src/*.rs`, `src/*` | `apps/windows/tauri` | Windows | preserved |
| Android donor shell/service/tile behavior | `android/app/src/main/java/app/v2rayez/gui/*` | `apps/android/aether-compat` | Android | preserved |
| System-wide routing and SOCKS mode | `src-tauri/src/routing.rs`, `settings.rs` | `universal-core/tunnel-policy`, `apps/windows` | Windows | preserved |
| TUN adapter/session recovery | `src-tauri/src/routing.rs` | `universal-core/resilience`, Windows shell | Windows | preserved |
| Scan Mode | `settings.rs`, `src/app.js`, UI controls | `universal-core/scanner`, app settings | Windows, Android | preserved |
| MASQUE H3/H2 controls and uTLS/noize settings | `settings.rs`, Aether core settings/env | `universal-core/transports/masque`, `obfuscation` | Android, Windows | preserved |
| Protocol validation (`masque`, `wg`, `gool`) | `settings.rs` tests and validation | `universal-core/config/schema` | All | preserved |
| Auto-update every 12h + manual check | `src-tauri/src/update.rs`, Android `AppUpdateManager.java`, `UpdateWorker.java` | `universal-core/ota`, UI settings | Android, Windows | preserved |
| SHA-256 and Android signer verification | `update.rs`, Android update classes | `universal-core/ota/security` | Android, Windows | preserved |
| EN/FA RTL support | `src/i18n.js`, Android resources | `apps/windows`, `apps/android` | Windows, Android | preserved |
| Specific UI text/status preservation | `PROMPT.md`, `src/app.js`, Android UI | `UI_CHANGELOG.md`, app UI | Android, Windows | preserved as contract |

---

## 5) EasySNI feature map

| Component / feature | Source paths | Target home | Platforms | Status |
|---|---|---|---|---|
| Single-binary Go web panel | `main.go`, `internal/server`, `internal/server/web/index.html` | `tools/easysni-sidecar`, `apps/windows/tools`, `apps/linux/tools` | Windows, Linux, macOS optional | preserved |
| SNI tunnel | `internal/sni`, `internal/proxy`, handlers | `universal-core/fronting/sni` | All where raw socket policy allows | preserved |
| DPI desync | `internal/desync/desync.go`, `raw_linux.go`, `raw_windows.go`, tests | `universal-core/obfuscation/desync` | Windows, Linux, OpenWrt, Android where possible | preserved |
| MITM/domain-fronting local proxy | `internal/mitmdf/*`, CA endpoints | `universal-core/fronting/mitm` | Android, Windows, Linux | preserved |
| Fronted DoH and host→front rules | `internal/sni/front.go`, `rewrite.go`, `mitmdf`, UI | `universal-core/fronting/rules` | All | preserved |
| Xray detection/run/speed/update | `internal/xray/*` | `universal-core/engines/xray`, Core Manager | Windows, Linux, Android/OpenWrt via core packs | preserved |
| sing-box integration | `internal/singbox/*` | `universal-core/engines/singbox` | Windows, Linux, OpenWrt, Android | preserved |
| sysproxy safe system proxy | `internal/sysproxy/*` | `universal-core/platform/sysproxy` | Windows, Linux, macOS optional | preserved |
| tun2socks | `internal/tun2socks/*` | `universal-core/tun2socks` | Windows, Linux, OpenWrt | preserved |
| Psiphon | `internal/psiphon/*` | `universal-core/transports/psiphon` | Windows, Linux, Android via MSN/UAC | preserved |
| GitHub downloader | `internal/ghdl/ghdl.go` | `universal-core/core-manager/downloader` | All | preserved |
| GTunnel / Google+Fastly relay | `internal/gtunnel/*` | `workers/gtunnel`, app generator | All client UIs | preserved |
| SPlus tunnel | `internal/splus/*` | `universal-core/transports/splus` or sidecar | Windows, Linux, Android if portable | preserved |
| WinDivert / Windows control | `internal/windivert`, `internal/winctl` | `apps/windows/platform` | Windows | preserved |
| Tor wrapper | `internal/tor/tor.go` | `universal-core/transports/tor` | Windows, Linux | preserved |
| BPB Panel compatibility | `internal/bpb`, `internal/server/bpb.go`, `internal/bpb/assets/worker.js` | `universal-core/deployers/bpb`, Tools UI | Android, Windows, Linux | preserved |
| EdgeTunnel generator | `internal/edgetunnel/edgetunnel.go` | `universal-core/deployers/edgetunnel` | Android, Windows, Linux | preserved |
| Config library/groups/QR/subscription | `internal/server/config.go`, `handlers.go`, `Configs` | `universal-core/config`, app UI | All | preserved |
| Scanners | `handlers.go` SNI/mass/CF/site/CDN config handlers | `universal-core/scanner`, app UI | All | preserved |
| Logs/event bus | `internal/logbus/logbus.go` | `universal-core/logging` | All | preserved |

---

## 6) MICAFP feature map

### 6.1 Rust daemon and core

| Module family | Source paths | Target home | Platforms | Status |
|---|---|---|---|---|
| AI runtime engines | `MICAFP/daemon/src/ai/*.rs` | `universal-core/ai` | All | preserved |
| Battery/power | `daemon/src/battery/*.rs`, Android/iOS battery helpers | `universal-core/battery`, platform shells | Android, iOS, laptops | preserved |
| Config/schema/IPFS/ISP profiles | `daemon/src/config/*.rs`, `configs/*.json` | `universal-core/config`, resources | All | preserved |
| IPC | `daemon/src/ipc/*` | `universal-core/ipc` | Windows, Linux, OpenWrt, desktop shells | preserved |
| Named VPN cores | `daemon/src/cores/*` | `universal-core/engines/*` | All | preserved |
| Load balancer | `daemon/src/load_balancer/*` | `universal-core/routing/load-balancer` | All | preserved |
| Mesh | `daemon/src/mesh/*` | `universal-core/mesh` | Android/iOS mobile + desktop where supported | preserved |
| Monitoring/metrics | `daemon/src/monitoring`, `daemon/src/metrics` | `universal-core/metrics`, dashboard | All | preserved |
| National intranet | `daemon/src/national_intranet/*` | `universal-core/national-intranet` | All; SMS/NAN/BLE platform-gated | preserved |
| Obfuscation engines | `daemon/src/obfuscation/*` | `universal-core/obfuscation` | All + browser WASM | preserved |
| Orchestrator/failover | `daemon/src/orchestrator/*` | `universal-core/orchestrator` | All | preserved |
| P2P overlays | `daemon/src/p2p/*` | `universal-core/p2p` | All | preserved |
| Platform modules | `daemon/src/platform/*`, `android`, `ios`, `linux`, `windows`, `openwrt` | platform apps/packages | All required | preserved |
| Post-quantum lab | `daemon/src/quantum/*`, `security/post_quantum.rs` | `universal-core/pq-lab` feature flag | All, off by default | preserved |
| Resilience | `daemon/src/resilience/*`, `watchdog` | `universal-core/resilience` | All | preserved |
| Scanners | `daemon/src/scanner/*` | `universal-core/scanner` | All | preserved |
| Security/privacy | `daemon/src/security/*` | `universal-core/security` | All | preserved |
| Telemetry DP | `daemon/src/telemetry/*` | `universal-core/telemetry` | All | preserved |
| Transports | `daemon/src/transport/*`, `transport/dual_mode/*` | `universal-core/transports` | All | preserved |
| Tunnel | `daemon/src/tunnel/*` | `universal-core/tunnel` | All | preserved |
| MICAFP transport core | `core/micafp-transport-core/src/*` | `universal-core/transport-core` | All | preserved |

### 6.2 Named VPN cores

| Core identity | Source | Target home | Carrier rules | Status |
|---|---|---|---|---|
| hiddify-core v4.1.0 | `daemon/src/cores/hiddify.rs`, docs | `universal-core/engines/hiddify` | IranCell, Asiatek | preserved |
| GFW-knocker/Xray-core v25.8.3-mahsa-r1 | `daemon/src/cores/xray.rs` | `universal-core/engines/xray` | Iran-specialized fallback | preserved |
| sing-box v1.14.0-alpha.25 | `daemon/src/cores/singbox.rs` | `universal-core/engines/singbox` | protocol management | preserved |
| AmneziaVPN awg-go 4.8.15.4 | `daemon/src/cores/amneziavpn.rs` | `universal-core/engines/amneziawg` | MCI, Shatel | preserved |
| DefyxVPN v5.2.8 | `daemon/src/cores/defyx.rs` | `universal-core/engines/defyx` | IranCell, Rightel | preserved |
| MoaV v1.7.7 | `daemon/src/cores/moav.rs` | `universal-core/engines/moav` | adaptive fallback | preserved |
| Lantern v7.9.0 | `daemon/src/cores/lantern.rs` | `universal-core/engines/lantern` | PT/domain-front fallback | preserved |
| MahsaNG v26.3.31-mahsa-r1 | `daemon/src/cores/mahsang.rs` | `universal-core/engines/mahsang` | MCI, Asiatek | preserved |
| Psiphon GFW-knocker fork | `daemon/src/cores/psiphon.rs` | `universal-core/engines/psiphon` | Shatel fallback, last-resort | preserved |

### 6.3 Dashboard, data, extensions, workers

| Area | Source paths | Target home | Status |
|---|---|---|---|
| Control-plane dashboard API routes | `MICAFP/dashboard/src/app/api/*` | `dashboard/src/app/api/*` | preserved |
| Prisma schema | `MICAFP/dashboard/prisma/schema.prisma` | `dashboard/prisma/schema.prisma` + new `License` model | preserved; license extension pending |
| Data assets | `MICAFP/configs/*.json` | `universal-core/resources/configs` | preserved |
| Browser extensions shared core | `MICAFP/extensions/shared/*.ts` | `extensions/shared` | preserved |
| Chrome extension | `MICAFP/extensions/chrome` | `extensions/chrome` | preserved |
| Firefox extension | `MICAFP/extensions/firefox` | `extensions/firefox` | preserved |
| WASM obfuscator | `MICAFP/extensions/wasm-obfuscator`, `MICAFP/wasm-obfuscator` | `extensions/wasm-obfuscator` | preserved |
| AI training pipeline | `MICAFP/ai-models/train`, `MICAFP/ai-models/quantize` | `ai-models` | preserved |
| CDN/relay workers | `MICAFP/workers/*` | `workers/*` | preserved |
| iOS Network Extension | `MICAFP/ios/**` | `apps/ios` | preserved |
| Linux package/service | `MICAFP/linux/**` | `packages/linux` | preserved |
| OpenWrt LuCI/UCI/netifd | `MICAFP/openwrt/**` | `packages/openwrt` | preserved |

---

## 7) MSN-GUARD feature map

| Feature | Source paths | Target home | Platforms | Status |
|---|---|---|---|---|
| Aether Rust core | `core/aether/src/*.rs` | `universal-core/engines/aether` | Android, Windows, Linux/iOS where portable | preserved |
| JNI bridge and TUN fd path | `app/src/main/cpp/aether_jni.cpp`, `CMakeLists.txt` | `apps/android/jni`, `universal-core/ffi/android` | Android | preserved |
| Android VpnService UI/lifecycle | `app/src/main/java/com/msnguard/vpn` | `apps/android` | Android | preserved |
| MASQUE over HTTP/3 | `core/aether/src/masque.rs`, `masque_h2.rs` | `universal-core/transports/masque` | All where core supports | preserved |
| WireGuard / WARP / WARP-on-WARP | `core/aether/src/wireguard.rs`, `warp.rs` | `universal-core/transports/wireguard`, `warp` | Android, Windows, Linux, iOS | preserved |
| Psiphon and Psiphon-over-WARP | `core/aether/src/psiphon.rs`, JNI comments/path | `universal-core/transports/psiphon` | Android, Windows/Linux via sidecars | preserved |
| Tor modes Direct/Meek/obfs4/Snowflake + Tor-over-WARP | `core/aether/src/tor.rs`, Android UI rows | `universal-core/transports/tor` | Android, Windows/Linux | preserved |
| Exit country picker and relay counts | Android UI/source data | app UIs + core relay metadata | Android initially; all UX surfaces | preserved |
| UDP/QUIC userspace bridge | Aether netstack/quiche/badvpn pieces | `universal-core/tunnel/udp-quic` | All where possible | preserved |
| Kill switch/DNS enforcement/verified connect | Android service/UI/core logic | `universal-core/reliability`, platform shells | All | preserved |
| Socket protection (`VpnService.protect`) | Android service/core callback | `universal-core/platform/android/socket-protect` | Android | preserved; critical test pending |
| badvpn/lwIP tun2socks pieces | `app/src/main/cpp/badvpn` | `universal-core/tun2socks`/Android bridge | Android | preserved |

---

## 8) UAC-SNI-Spoofer Android feature map

| Feature | Source paths | Target home | Platforms | Status |
|---|---|---|---|---|
| Native Xray TUN | `app/libs/libv2ray-native-tun.aar`, `XrayNativeTunEngine.kt`, `UacVpnService.kt` | `universal-core/engines/xray`, `apps/android` | Android | preserved |
| Full profile parser fidelity | `profiles/ProfileUriParser.kt`, `SubscriptionConfigParser.kt`, `MciXrayConfigBuilder.kt` | `universal-core/config` | All | preserved |
| Adaptive Connection | `vpn/AdaptiveConnection.kt`, `AdaptiveGatePolicy.kt`, `ConnectEdgePool.kt` | `universal-core/adaptive-routing` | All | preserved |
| Champion/Backup/cooldown/metrics | `ConnectionMetricsStore.kt`, `ConnectRescueStore.kt`, `RuntimeHealthGuard.kt` | `universal-core/adaptive-routing`, `resilience` | All | preserved |
| Route Speed Test | `ui/RouteSpeedTestController.kt`, `RouteSpeedTestService.kt`, `RouteSpeedTestProfile.kt`, `RouteSpeedTestScreen.kt` | `universal-core/scanner/route-speed-test`, UI | Android, desktop optional | preserved |
| Edge × DNS × Fragment × MTU matrix | route test and MCI classes | `universal-core/adaptive-routing` | All | preserved |
| DoH resolvers | `vpn/AdaptiveDnsResolvers.kt`, DNS icons | `universal-core/dns` | All | preserved |
| Config Maker / SNI Maker | `ui/SniMaker*`, `mci/*` | `apps/android/tools`, `universal-core/scanner` | Android, desktop optional | preserved |
| App routing modes | `vpn/AppRoutingPreferences.kt`, `ui/AppBypassScreen.kt` | platform tunnel policy | Android, Windows/Linux analog | preserved |
| Fragment/FinalMask/MTU/Mux/Keepalive/QUIC controls | advanced settings + MCI builders | `universal-core/config`, app settings | All | preserved |
| Tor/WebTunnel bridge subsystem | `engine/tor/*`, `assets/tor/bridges-webtunnel.txt` | `universal-core/transports/tor-webtunnel` | Android, desktop optional | preserved |
| Runtime diagnostics and socket protector | `RuntimeDiagnostics*`, `vpn/SocketProtector.kt`, `VpnConnectivityProbe.kt` | `universal-core/reliability`, Android bridge | Android | preserved |
| Live logs/ping/traffic/country/IP | `logging`, `TrafficStatsStore.kt`, UI screens | app UI + core metrics | Android and cross-platform | preserved |
| Third-party notices/assets | `THIRD_PARTY_NOTICES.md`, `third_party/*`, flags/fonts | root `THIRD_PARTY_NOTICES.md`, app assets | All redistributions | preserved |

---

## 9) UAC-SNI-Spoofer Windows feature map

| Feature | Source paths | Target home | Platforms | Status |
|---|---|---|---|---|
| Python desktop implementation | `uac_desktop/*.py`, `main.py`, `.spec` | `apps/windows/python-tools` wrapped by desktop product | Windows | preserved |
| Patterniha SNI spoofing | `uac_desktop/pattern_core/*`, third-party Patterniha | `universal-core/adaptive-routing/patterniha` or wrapped Python | Windows; portable logic to core where safe | preserved |
| Npcap capture | `uac_desktop/npcap.py` | `apps/windows/platform/npcap` | Windows | preserved |
| Xray SOCKS/HTTP and optional sing-box TUN | `engine.py`, `network.py`, `gateway.py` | `apps/windows`, `universal-core/engines` | Windows | preserved |
| Per-carrier profiles MCI/IranCell + Auto | `app_config.py`, `storage.py`, `models.py`, docs | `universal-core/adaptive-routing/carriers` | Windows + all | preserved; extension to 5 carriers pending |
| Mobile Gateway | `gateway.py`, artifacts/gateway tests | `apps/windows/mobile-gateway` | Windows | preserved |
| Live SNI/Edge scan and ranking | `sni_maker.py`, `sni_batch.py`, `tls_tools.py`, `fragment_proxy.py` | `universal-core/scanner`, Windows UI | Windows | preserved |
| MCI TLS startup optimization and YouTube warmup | `engine.py`, `tls_tools.py`, docs/artifacts | `universal-core/adaptive-routing/mci` | Windows + all where applicable | preserved |
| Suggested config ranking | scan/test artifacts + UI | `universal-core/scanner/recommender` | Windows + all | preserved |
| App Bypass/logs/public IP/advanced settings | `ui.py`, `network.py`, `storage.py` | Windows UI + core settings | Windows | preserved |
| GitHub Releases update checker | `update_checker.py` | `universal-core/ota`, Windows UI | Windows | preserved |
| Safe proxy restore | `network.py`, `gateway.py` | Windows platform manager | Windows | preserved |
| ICMP direct routing | docs/source logic | `universal-core/platform/windows/icmp-policy` | Windows, Linux analog | preserved |
| Wizard assistant separation | `assistant.py`, `assistant_messages.py`, `wizard guider/*.png` | `apps/windows/assistant`, localization resources | Windows; optional cross-platform | preserved |

---

## 10) MasterDnsVPN feature map

| Feature | Source paths | Target home | Platforms | Status |
|---|---|---|---|---|
| DNS tunnel client/server binaries | `cmd/client/main.go`, `cmd/server/main.go` | `universal-core/transports/dns-tunnel`, `server/dns-tunnel` | All client platforms + Linux server | preserved |
| ARQ retransmission | `internal/arq/*` | `universal-core/transports/dns-tunnel/arq` | All | preserved |
| Multipath and resolver selection | `internal/client/balancer.go`, dispatcher/runtime | `universal-core/transports/dns-tunnel/multipath` | All | preserved |
| Eight balancing strategies | `internal/client/balancer.go` constants/tests | `universal-core/transports/dns-tunnel/balancer` | All | preserved |
| Health check auto-disable/reactivate | `balancer.go`, `ping_manager.go`, async runtime | `universal-core/transports/dns-tunnel/health` | All | preserved |
| MTU discovery/sync | `internal/client/mtu*`, handlers, server policy sync | `universal-core/transports/dns-tunnel/mtu` | All | preserved |
| Encryption methods | `internal/security/codec.go`, `encryption_key.go` | `universal-core/transports/dns-tunnel/security` | All | preserved |
| Compression OFF/ZSTD/LZ4/ZLIB | `internal/compression/types.go` | `universal-core/transports/dns-tunnel/compression` | All | preserved |
| Local DNS and cache | `internal/dnscache`, `internal/client/dns_listener.go`, handlers | `universal-core/dns/local-cache` | All | preserved |
| SOCKS5/SOCKS4 proxy/UDP associate | `internal/socksproto`, `internal/client/socks_manager.go` | `universal-core/local-proxy` | All | preserved |
| TCP forwarding mode | `internal/client/handlers/stream_handlers.go`, server forwarding config | `universal-core/transports/dns-tunnel/tcp-forward` | All | preserved |
| Packed control/request batching | `handlers/packed_control_handler.go`, `vpnproto/packing.go` | `universal-core/transports/dns-tunnel/framing` | All | preserved |
| Deferred sessions/invalid cookie/fragment store | `internal/udpserver/*`, `fragmentstore`, `inflight` | `server/dns-tunnel/runtime` | Linux/OpenWrt/server | preserved |
| Base codecs | `internal/basecodec/*` | `universal-core/transports/dns-tunnel/codec` | All | preserved |
| TOML configs | `client_config.toml.simple`, `server_config.toml.simple`, `internal/config/*` | app settings + docs | All | preserved |
| Linux installer and Docker | `server_linux_install.sh`, `docker/*` | `server/dns-tunnel/deploy` | Linux server | preserved |
| Benchmarks/tests | `scripts/bench`, `*_test.go` | CI | Developer/CI | preserved; Go toolchain blocked locally |

---

## 11) New feature target map

| New feature | Target home | Depends on | Status |
|---|---|---|---|
| AI Provider Gateway panel | `universal-core/ai-provider`, `apps/*/settings/ai-engine`, `dashboard/api/ai-engine` | MICAFP local AI runtime, secure platform secret stores | mapped; pending implementation |
| Provider JSON/form adapter | `universal-core/ai-provider/schema` | OpenAI/Anthropic/Gemini/generic mock tests | mapped; pending implementation |
| Test & Auto-detect | `universal-core/ai-provider/probe` | network probe paths and active tunnel probe | mapped; pending implementation |
| External AI fallback to local AI | `universal-core/ai-provider/fallback` | MICAFP AI engines | mapped; pending implementation |
| License Prisma model | `dashboard/prisma/schema.prisma` | Existing `User`, `Session`, `AuditLog` | mapped; pending implementation |
| License signing/validation | `universal-core/license`, `dashboard/api/licenses/*` | Ed25519, signed server time, device binding | mapped; pending implementation |
| Client hard cutoff | `universal-core/license/gate` called before tunnel start | all platform shell start flows | mapped; pending implementation |
| Renewal/activation UI | `apps/android`, `apps/ios`, `apps/windows`, `packages/openwrt/luci`, `dashboard` | license APIs | mapped; pending implementation |

---

## 12) Known blockers from Milestone 0 environment

| Blocker | Affected validation | Evidence | Required fix |
|---|---|---|---|
| Go toolchain missing | EasySNI and MasterDnsVPN `go test`/build | `go: command not found` | Install Go 1.24+ or provide CI image with Go. |
| Rust toolchain missing | MICAFP/Aether/wasm-obfuscator cargo tests/builds | `cargo: command not found`, `rustc: command not found` | Install Rust stable, Android/iOS targets, wasm target. |
| Java missing and Gradle wrapper not executable | Android builds | `java: command not found`, `./gradlew: Permission denied` | Install Java 17; chmod wrappers or invoke with `bash gradlew`; Android SDK/NDK required. |
| iOS signing environment unknown | IPA export | No Xcode/signing checked in Linux sandbox | Need macOS/Xcode/Apple team/Network Extension entitlements. |
| Real transport servers not configured | E2E traffic tests | No endpoint secrets/configs provided | Create lab endpoints or provide test server configs; do not fake results. |
| Hardware-specific mesh features | BLE/Wi-Fi Aware/NAN validation | sandbox has no radios/mobile devices | Use device lab for final tests; simulator-only results must be labeled non-final. |

---

## 13) Next implementation step

Milestone 1 should create the canonical `universal-core` workspace and move the first safe, self-contained implementation pieces into it:

1. License gate API surface and structs, with real signature verification tests.
2. Config model preserving VLESS/VMess/Trojan/Shadowsocks field fidelity.
3. AI Provider Gateway schema/probe mocks without external API dependency.
4. Core Manager manifest model covering Xray/sing-box/Tor/PT/Psiphon/DNS-tunnel/Aether packs.
5. Platform FFI/IPC contracts for Android/iOS/Windows/Linux/OpenWrt.

No transport should be marked `merged` until it is connected to the core and has build + E2E evidence.

---

## 14) Milestone 1 additions — canonical API and real security/provider primitives

| Feature | Source/requirement | New target files | Platforms | Status | Evidence |
|---|---|---|---|---|---|
| Shared Rust core API boundary | Architecture contract | `universal-core/Cargo.toml`, `universal-core/src/lib.rs` | Android, iOS, Windows, Linux, OpenWrt | in progress | Rust build blocked locally: toolchain missing |
| Rust license verification/gate model | New license requirement | `universal-core/src/license.rs` | All | in progress | Unit tests written; compile blocked by missing Cargo |
| Rust AI provider schema/response extraction | New AI Gateway requirement | `universal-core/src/ai_provider.rs` | All | in progress | Unit tests written; compile blocked by missing Cargo |
| Rust config fidelity model | V2RayEZ/UAC config fidelity | `universal-core/src/config.rs` | All | in progress | Unit tests written; compile blocked by missing Cargo |
| Rust addon/Core Manager manifest model | V2RayEZ donor Core Manager (Aether/EasySNI adapters) | `universal-core/src/core_manager.rs` | All | in progress | Unit tests written; compile blocked by missing Cargo |
| Dashboard license database extension | New license requirement + MICAFP Prisma | `MICAFP/dashboard/prisma/schema.prisma` | Server/Web | in progress | Schema edited; Prisma validation blocked until dependencies/tooling are installed |
| Ed25519 license crypto primitives | New license requirement | `MICAFP/dashboard/src/lib/license-crypto.mjs`, `.d.ts` | Server/Web + clients by equivalent core verifier | in progress | `node tools/license_crypto_selftest.mjs` PASS |
| License service and REST handlers | New license API requirement | `MICAFP/dashboard/src/lib/license-service.ts`, `license-auth.ts`, `src/app/api/licenses/**`, `src/app/api/users/[id]/licenses/route.ts` | Server/Web | in progress | Syntax of MJS checked; full Next/Prisma build pending |
| AI Provider Gateway JS implementation | New AI Gateway requirement | `MICAFP/dashboard/src/lib/ai-provider-gateway.mjs`, `.d.ts`, `src/app/api/ai-engine/providers/test/route.ts` | Server/Web; target all app settings | in progress | `node tools/ai_provider_gateway_selftest.mjs` PASS |
| License API documentation | New license requirement | `docs/LICENSE_API.md` | All | in progress | Documentation created |
| AI Provider Gateway documentation | New AI Gateway requirement | `docs/AI_PROVIDER_GATEWAY.md` | All | in progress | Documentation created |

Milestone 1 does not mark any transport as fully merged yet. The work creates real primitives that later platform shells and the Rust orchestrator must call before starting any VPN/tunnel.

---

## 15) Milestone 2 additions — Android License + AI Engine wiring

| Requirement | Android implementation files | Status | Evidence |
|---|---|---|---|
| Keep V2RayEZ as base app and preserve UI style | `app/src/main/java/com/v2rayez/app/ui/screens/settings/LicenseScreen.kt`, `AiEngineScreen.kt`, `SettingsScreen.kt` | in progress | New screens use existing `V2BackTopBar`, `SectionHeader`, `CardSurface`, settings rows and Material3 controls. |
| Serial/license activation UI | `LicenseScreen.kt`, `LicenseAiViewModels.kt`, `ConfigModels.kt` | in progress | Settings → License route added; serial is redacted in status and stored outside DataStore. |
| Anti-forgery/per-user expiry/hard cutoff before Android tunnel start | `AndroidLicenseRepository.kt`, `SecureStringStore.kt`, `V2RayVpnService.kt`, `MitmProxyService.kt` | in progress | Ed25519 compact token verifier + account binding + expiry check + service gates + active license watchdogs added. Build/device test pending due missing Java/device. |
| Online validation and offline grace | `AndroidLicenseRepository.kt`, `docs/LICENSE_API.md` | in progress | Calls `/api/licenses/validate`; stores signed grace token in Android-Keystore-backed storage; checks device hash and grace expiry. |
| No-code AI provider settings | `AiEngineScreen.kt`, `AndroidAiProviderGateway.kt`, `LicenseAiViewModels.kt`, `ConfigModels.kt` | in progress | Settings → AI Engine route added; provider config supports base URL, endpoint, model, headers JSON, request template, response path, API-key alias. |
| External AI blocked/unreachable fallback | `AndroidAiProviderGateway.kt`, `V2RayVpnService.kt` | in progress | Gateway returns local V2RayEZ anti-DPI fallback; VPN service invokes advisor asynchronously after probe failures. |
| Localization parity | `app/src/main/res/values*/strings.xml` | complete for added strings | `scripts/gates/string-key-parity.sh` PASS; EN/FA/RU all 1017 keys. |

No donor features were deleted in this milestone. Android build and device traffic verification remain blocked locally by missing Java/Android runtime and lack of test devices/endpoints.

---

## 16) Milestone 3 additions — desktop/Tauri license + AI wiring and Android controller preflight

| Requirement | Implementation files | Platforms | Status | Evidence |
|---|---|---|---|---|
| Desktop serial/license activation UI and commands | `V2RayEZ-GUI/src/index.html`, `src/app.js`, `src-tauri/src/lib.rs`, `src-tauri/src/license.rs` | Windows/Linux V2RayEZ desktop GUI | in progress | Frontend `node --check` PASS; `npm test` PASS 14/14; Rust compile blocked by missing Cargo. |
| Desktop anti-forgery/per-user expiry/hard cutoff | `src-tauri/src/license.rs`, `src-tauri/src/lib.rs`, `universal-core/src/license.rs` | Windows/Linux desktop shell | in progress | License gate before Aether/VPN start and connected watchdog added; runtime/E2E pending. |
| Desktop no-code AI Provider Gateway | `src/index.html`, `src/app.js`, `src-tauri/src/ai_provider.rs`, `src-tauri/src/settings.rs` | Windows/Linux desktop shell | in progress | UI fields and Tauri test command added; frontend static regression PASS; external/local API runtime pending. |
| Secret-free desktop settings | `src-tauri/src/settings.rs`, `src-tauri/src/ai_provider.rs`, `src-tauri/src/license.rs`, `src-tauri/src/secure_store.rs`, `tests/frontend.test.mjs` | Windows/Linux desktop shell | in progress | Test asserts no `apiSecret`/`license_key` in persisted settings model; Windows DPAPI/Unix `0600` helper added; Rust compile pending. |
| Android controller preflight | `app/src/main/java/com/v2rayez/app/data/repository/RealVpnController.kt` | Android | in progress | `connect()`/`toggle()` now call `AndroidLicenseRepository.enforce()` before `startForegroundService`; Java build pending. |

Milestone 3 remains additive: the V2RayEZ compact GUI identity, existing navigation, Smart Connect, MASQUE fallback, updater, split tunneling, routing recovery, and tray flow were preserved. The legacy Aether GUI donor is donor behavior only, not the final product GUI.

---

## 17) Milestone 4 additions — OpenWrt LuCI license + AI wiring

| Requirement | Implementation files | Platforms | Status | Evidence |
|---|---|---|---|---|
| OpenWrt license settings | `MICAFP/openwrt/files/etc/config/unifiedshield`, `src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua` | OpenWrt LuCI | in progress | UCI/LuCI fields added; Lua runtime pending. |
| OpenWrt service fail-closed license gate | `MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh`, `files/etc/init.d/unifiedshield` | OpenWrt | in progress | `sh -n` PASS; `.ipk`/router runtime pending. |
| OpenWrt no-code AI Provider Gateway | `MICAFP/openwrt/files/usr/libexec/unifiedshield/ai-provider-test.lua`, `files/etc/config/unifiedshield`, LuCI CBI config | OpenWrt LuCI | in progress | Config/UI/helper added; Lua runtime and network tests pending. |
| OpenWrt universal/generic package install paths | `MICAFP/openwrt/Makefile` | OpenWrt `.ipk` | in progress | Makefile normalized to `unifiedshield`; OpenWrt SDK build blocked locally. |

No MICAFP/OpenWrt feature source was deleted. The OpenWrt shell fallback deliberately refuses offline grace without the native universal-core verifier to avoid weakening anti-forgery guarantees.

---

## 18) Milestone 5 additions — iOS license + AI wiring

| Requirement | Implementation files | Platforms | Status | Evidence |
|---|---|---|---|---|
| iOS serial/license UI | `MICAFP/ios/UnifiedShield/App/SettingsView.swift`, `App/LicenseManager.swift` | iOS app | in progress | Swift brace-balance PASS; Swift/Xcode build blocked. |
| iOS Keychain anti-forgery/expiry/grace | `App/LicenseManager.swift`, `NetworkExtension/ExtensionLicenseGate.swift` | iOS app + Network Extension | in progress | CryptoKit Ed25519/local expiry/grace code added; real target membership/keychain sharing pending. |
| iOS hard cutoff before/during tunnel | `NetworkExtension/TunnelManager.swift`, `NetworkExtension/PacketTunnelProvider.swift` | iOS Network Extension | in progress | App-side and extension-side preflight/watchdog added; device tunnel test pending. |
| iOS no-code AI Provider Gateway | `App/AIProviderGateway.swift`, `App/SettingsView.swift`, `NetworkExtension/ExtensionAIAdvisor.swift` | iOS | in progress | Provider UI/config/keychain secret path added; external/local runtime pending. |

No existing MICAFP iOS sections or Network Extension capabilities were removed; Security/DNS/General/About settings remain in `SettingsView.swift`.

---

## 19) Milestone 6 additions — Dashboard license + AI admin UI

| Requirement | Implementation files | Platforms | Status | Evidence |
|---|---|---|---|---|
| Dashboard license admin | `MICAFP/dashboard/src/components/license-admin-panel.tsx`, `src/app/page.tsx` | Dashboard/Web | in progress | UI calls issue/validate/revoke/renew APIs; dashboard lint blocked (`eslint: not found`). |
| Dashboard AI provider admin/test | `MICAFP/dashboard/src/components/ai-provider-gateway-panel.tsx`, `src/app/page.tsx` | Dashboard/Web | in progress | UI calls provider test API; dashboard lint/build blocked by missing dependencies. |
| Preserve dashboard modules | `MICAFP/dashboard/src/app/page.tsx` | Dashboard/Web | in progress | Existing tabs remain; license/ai-gateway tabs were added additively. |

---

## 20) Milestones 30-35 additions — identity, license cutoff, OpenWrt packaging, release artifacts

| Requirement | Implementation files | Platforms | Status | Evidence |
|---|---|---|---|---|
| Canonical V2RayEZ AI defaults/fallback identity | `universal-core/src/ai_provider.rs`, `MICAFP/dashboard/src/app/api/ai-engine/providers/test/route.ts`, `MICAFP/openwrt/files/etc/config/unifiedshield`, base Android AI models/viewmodels/resources, `docs/AI_PROVIDER_GATEWAY.md` | Android, iOS-compatible storage, desktop, OpenWrt, dashboard | in progress | `node tools/ai_provider_gateway_selftest.mjs` PASS; `node tools/android_ai_settings_migration_gate.mjs` PASS; dashboard lint/build PASS in Milestone 30 evidence. |
| Legacy persisted AI settings self-heal to V2RayEZ identity | base Android `SupportedLanguages.kt`, `DataStoreSettingsRepository.kt` caller path | Android | in progress | Android settings migration gate PASS; EN/FA/RU string-key parity PASS. |
| Signed serial lifecycle E2E self-test | `tools/license_serial_e2e_selftest.mjs`, dashboard license crypto primitives | Server/Web + all client-equivalent verifiers | in progress | E2E self-test covers issue, validate, device binding, grace, hard cutoff, forgery, mismatch, expiry, revocation. |
| Runtime hard-cutoff watchdog tightening | `V2RayEZ-GUI/src-tauri/src/lib.rs`, base Android `V2RayVpnService.kt`, iOS `PacketTunnelProvider.swift`/`TunnelManager.swift`, OpenWrt `license-watchdog.sh` and init script | Windows/Linux desktop, Android, iOS, OpenWrt | in progress | `node tools/runtime_license_watchdog_gate.mjs` PASS; shell syntax PASS; real device/router timing pending. |
| OpenWrt source pin and SDK `.ipk` build wrapper | `MICAFP/openwrt/Makefile`, `MICAFP/scripts/package-openwrt.sh`, `tools/openwrt_packaging_gate.mjs` | OpenWrt LuCI `.ipk` | in progress | Source pinned to commit `5263aebfdc4673bba8cd56049de26ae3dd7509e3`; `--check` PASS; real `.ipk` blocked by missing SDK. |
| Universal release artifact build contract | `scripts/build-release-artifacts.sh`, `tools/release_artifact_contract_gate.mjs` | Android `.apk`, iOS `.ipa`, Windows `.exe`, Linux package, OpenWrt `.ipk`, dashboard, browser extensions | in progress | `scripts/build-release-artifacts.sh --check` PASS; gate asserts required artifact formats and no placeholder generation. |

These additions remain additive: donor networking capabilities stay preserved behind V2RayEZ UI/UX, while source gates prevent legacy donor GUI identity or fake release artifacts from becoming release evidence.

---

## 21) Milestone 68 additions — continuation traceability

| Requirement | Implementation files | Platforms | Status | Evidence |
|---|---|---|---|---|
| Offline license manager hardening (no unverifiable imports) | `V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/license-admin/src/main/java/com/v2rayez/licenseadmin/OfflineLicenseManager.java` | Android license-admin | merged (admin manager) | `node tools/offline_license_manager_gate.mjs` PASS. `verifyImportedRecord` rejects imported records whose `licenseKey` does not verify against the manager's Ed25519 public key or whose signed payload does not match record fields; `seed()` now persists with blocking `commit()`. |
| Pure-offline signed serial + revocation-list behavior test | `tools/license_serial_e2e_selftest.mjs` | All verifier-equivalent paths | merged (node self-test) | `node tools/license_serial_e2e_selftest.mjs` PASS. Asserts offline serial works without dashboard/grace token, detects tamper/account/device/expiry/status failures, and honors a signed `V2RayEZ-Revocation-List` token. |
| Anti-fabrication pass on dashboard telemetry | `MICAFP/dashboard/src/app/api/{health,cores,auto-reconnect,orchestrator,dpi-test,geo-router,ota,ai-engine,security-audit,threat-intel}/route.ts`, `MICAFP/dashboard/src/lib/geo-router.ts`, `MICAFP/dashboard/src/lib/{auto-scanner-engine,network-analyzer,security-audit,stealth-rotation,unified-shield-store,unified-shield-store-p2p-intranet}.ts`, `tools/vor_anti_fabrication_gate.mjs` | Dashboard + tooling | merged/fixed | `node tools/vor_anti_fabrication_gate.mjs` PASS. All fabricated `Math.random()` metrics removed from production API routes; they fail closed with `real_core_backend_unavailable`. Remaining simulation libraries are explicitly labeled `SIMULATION ONLY — NOT REAL TELEMETRY`. |
| Vor brand rename (shipping identity) | Android strings/label, iOS `project.yml`+Info.plist+Swift, `V2RayEZ-GUI` package/tauri/index/app.js, dashboard package/i18n/layout, OpenWrt LuCI/Makefile/files, brand SVGs, `tools/vor_brand_rename_gate.mjs` | Android, iOS, Windows/Linux desktop, Dashboard, OpenWrt LuCI | merged (user-facing) | `node tools/vor_brand_rename_gate.mjs` PASS. Package identifiers `com.v2rayez.*`, protocol token types `V2RayEZ-License`, ledger schemas `v2rayez.license.v1`, and donor source trees remain `v2rayez` for compatibility. |
| Known Rust offline-grace gap | `universal-core/src/license.rs` | All native shells | blocked (Rust compile unavailable) | `cargo`/`rustc` absent; crates.io unreachable. See `CONTINUATION_REPORT.md`. `offline_start_decision` still requires a grace token and ignores the serial's own offline grace/device binding/revocation list. |
