# Gemini Engineering Prompt — V2RayEZ Universal Full Feature Merge

> **Audience:** Google Gemini / a senior autonomous coding agent.  
> **Goal:** Merge the V2RayEZ base app plus all donor projects into one canonical product, **V2RayEZ Universal**, with zero feature loss, preserved UI/UX, real builds, and real traffic tests.  
> **Important:** Do not treat this as a brainstorming task. Treat it as an implementation contract with traceability, tests, and release artifacts.

---

## 0) First, read this carefully

You are the lead engineer for **V2RayEZ Universal**, the single canonical successor to the following source trees:

1. `V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/` — base Android V2RayEZ app.
2. `V2RayEZ-GUI/` — donor Windows/Android shell behavior around Aether and sing-box; **not** final GUI identity.
3. `EasySNI- Make sure to fully add all features to the V2RayEZ app/` — Go single-binary local web panel, SNI tunnel, domain-fronting, scanners.
4. `MICAFP/` — MICAFP-UnifiedShield vip-ultra-Quantum-ultra, Rust daemon + Flutter/mobile/desktop/platform code; largest feature source.
5. `MSN-GUARD- Make sure to fully add all features to the V2RayEZ app/` — Android VpnService + Rust/Aether core + MASQUE/WireGuard/WARP/Psiphon/Tor.
6. `UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app/` — Android Xray/TUN adaptive route racing, WebTunnel/Tor, per-app routing.
7. `UAC-SNI-Spoofer-Windows- Make sure to fully add all features to the V2RayEZ app/` — Python Windows desktop app with Patterniha SNI spoofing, Npcap, Mobile Gateway.
8. `MasterDnsVPN-main/` — Go DNS-request/response VPN/tunnel, multipath DNS transport, server installer and Docker packaging.

The product must be the union of all features. **Do not delete, simplify, silently omit, or replace a feature with a placeholder.** If a feature cannot be implemented in a milestone, stop and explicitly report the blocker with the exact source path and reason.

---

## 1) Non-negotiable product and UI constraints

### 1.1 UI/UX preservation lock

The current V2RayEZ UI/UX is the baseline. The final app must remain visually and behaviorally consistent with the existing app and the reference video/design provided by the product owner.

Rules:

- **Do not redesign the app.** Keep the same visual language, navigation model, spacing rhythm, dark/light theme behavior, Persian RTL support, typography, icons, cards, animations, home connection flow, and settings structure unless a feature absolutely requires an added screen.
- Add advanced capabilities through existing patterns: settings panels, advanced sections, collapsible cards, tabs, tool pages, dashboard pages, and contextual inline messages.
- Do **not** add disruptive pop-ups, ads, forced modal flows, or random onboarding interruptions. Renewal/license warnings may appear as calm inline banners and countdown chips, not noisy popups.
- Preserve existing screens and concepts from V2RayEZ: Home, Servers, Server Editor, Browser, MITM/Domain Fronting tools, Tools, Core Manager, Advanced VPN, Logs, Statistics, Hotspot Share, Warp, BPB Panel, Notifications, About, onboarding/wizard, quick widgets.
- Preserve V2RayEZ GUI/UX on all shipped surfaces; only donor behavior from the legacy Aether GUI source may be reused behind the V2RayEZ interface.
- Preserve UAC-Windows animated Wizard guide as an optional assistant component, with logic and text kept separate for localization.
- Add screenshot/visual-regression tests before and after UI changes. Any intended UI difference must be listed in a `UI_CHANGELOG.md` entry and approved by the feature contract.

### 1.2 No stubs in release builds

- No TODO-only code, fake success, mocked transport, dummy AI, fake VPN state, or simulated connectivity may ship in release artifacts.
- Any source file currently named or acting as a stub, such as build-tag fallback files, must be replaced by a real implementation for all required release targets, or be limited to clearly excluded development-only builds. Release artifacts must not depend on those stubs for in-scope features.
- Never report “done” until code compiles and real traffic passes through the tunnel.

### 1.3 Defensive-use and privacy guardrails

- All anti-DPI, SNI, domain-fronting, mesh, and fallback features are for the user’s **own outbound traffic**, censorship circumvention, resilience, and privacy. Do not add tools for attacking, exploiting, credential theft, unauthorized interception, or compromising third-party systems.
- Local HTTPS/MITM/domain-fronting inspection is allowed only for the user’s own device/app traffic, with explicit local CA installation and clear UI disclosure.
- XTLS-Reality/REALITY support must be implemented as protocol-compatible TLS camouflage and authenticated fallback behavior; do not describe or implement theft of private keys, certificates, or sessions.
- Telemetry is opt-in or strictly operational as already defined, scrubbed before upload, and differentially private where applicable. Never upload hosts, full URIs, bridges, IP addresses, PEMs/certificates, fingerprints, subscription bodies, API keys, license keys, or other PII.

---

## 2) Required platform targets and artifacts

Build and test all required targets at every milestone:

| Platform | Required artifact | Mandatory requirements |
|---|---|---|
| Android | `.apk` | Kotlin + Jetpack Compose + Hilt + Room + DataStore; minSdk 26; native `VpnService`; universal APK containing `armeabi-v7a`, `arm64-v8a`, and `x86_64` at minimum; keep existing `x86` native assets when present. |
| iOS | `.ipa` | Swift UI/lifecycle shell; Network Extension / Packet Tunnel Provider; static Rust lib or XCFramework; kill switch where supported; if signing entitlements/certificates are unavailable, stop and report rather than claiming a finished IPA. |
| Windows | `.exe` installer + portable build | Windows 10/11 x64; system-wide TUN through sing-box/WinTun where applicable; preserve V2RayEZ desktop GUI while reusing Tauri/V2RayEZ-GUI Aether-adapter donor behavior and UAC-Windows behavior; preserve Npcap-dependent features where required. |
| Linux | Native binary + package | Native daemon/binary; systemd service option; Debian/RPM/Arch packaging from MICAFP must be preserved where present. |
| OpenWrt / LuCI | `.ipk` | **Generic/universal OpenWrt target, not device-specific**; include daemon, UCI config, netifd protocol integration, and a real LuCI web UI app, not just CLI. |

Optional bonus target: preserve MICAFP Flutter/macOS and any darwin sysproxy code if it merges cleanly, but do not block the five mandatory targets on macOS.

---

## 3) Core architecture contract

### 3.1 One canonical shared core

Use one shared core architecture. The core must be written/orchestrated in Rust and compiled/exposed as:

- Android: JNI shared library plus stable Kotlin API.
- iOS: static library / XCFramework callable from Swift and Packet Tunnel Provider.
- Windows: DLL/native executable/sidecar called by Tauri or the desktop shell.
- Linux/OpenWrt: native daemon/binary plus IPC.
- Browser extensions: WASM where needed, especially obfuscation.

This does **not** mean deleting named engines. Preserve the named engine identities and versions, but centralize orchestration, policy, routing, license enforcement, AI selection, telemetry scrubbing, config parsing, and state transitions in the canonical Rust core.

### 3.2 Aether/MSN architecture note

V2RayEZ-GUI Aether-adapter donor code and MSN-GUARD do **not** represent two unrelated VPN cores. MSN-GUARD’s Rust core (`libaether.so` + `libaether_jni.so`) is the CluvexStudio/Aether engine, the same engine wrapped by the V2RayEZ-GUI Aether-adapter donor shell. That donor integrates Aether v1.7.0, but V2RayEZ remains the final GUI/product.

Implementation rule:

- Merge Aether exactly once.
- Layer both feature sets on that single Aether integration:
  - MSN-GUARD: 5-transport device-wide VPN behavior, Tor/Psiphon/WARP chains, socket protection, verified connect, kill switch.
  - V2RayEZ-GUI Aether-adapter donor: Windows/Android shell behavior, Scan Mode, routing, MASQUE H3/H2 controls, signed auto-update, Tauri Windows surface.
- MICAFP’s Rust daemon is distinct and must be genuinely integrated/merged with Aether through the unified orchestration layer, not simply renamed.

### 3.3 Go and Python donor code integration

EasySNI and MasterDnsVPN are Go projects; UAC-Windows is Python. Preserve their behavior without duplicating platform-specific logic:

- Prefer porting reusable protocol/transport logic into Rust modules when that is maintainable.
- If porting is risky, compile donor engines as vetted sidecars or C-ABI/static libraries managed by the Rust core and Core Manager. All platform UIs must still call the unified Rust core API, not reimplement transport logic directly.
- Preserve original tests from Go/Python and add cross-language integration tests.
- Keep licenses and notices intact.

---

## 4) Mandatory inventory and traceability before coding

Before modifying implementation code, produce these documents and keep them updated:

1. `MERGE_TRACEABILITY.md`
   - Line-by-line / module-by-module feature map from every source tree to a target module, file, UI surface, API route, and test.
   - Include exact source paths and target paths.
   - Include status values: `preserved`, `ported`, `wrapped`, `merged`, `superseded-with-equivalent`, `blocked`.
   - `blocked` requires a detailed reason and a proposed fix; never silently omit.

2. `FEATURE_MATRIX.md`
   - One row per feature and subfeature below.
   - Columns: source project, source files, target component, target platforms, implementation status, build test, E2E connectivity test, regression test.

3. `UI_CHANGELOG.md`
   - Must prove the UI was preserved and only additive screens/controls were introduced.

4. `TEST_EVIDENCE.md`
   - Store build commands, artifact names, checksums, devices/OS versions, endpoint configs, traffic probes, DNS leak results, throughput samples, and failures.

No milestone is complete until these documents are updated.

---

## 5) Source feature inventory that must be preserved

### 5.1 Base V2RayEZ

Preserve all base app behavior:

- Android app using Kotlin, Jetpack Compose, Hilt, Room, DataStore.
- Xray core via `libv2ray.aar`; support VLESS, VMess, Trojan, Shadowsocks.
- Import via share link, QR, file, raw text, clipboard, subscription URL.
- Non-destructive multi-subscription merge and duplicate removal.
- Per-app proxy/routing; Iran geo bypass and GeoIP/GeoSite assets.
- In-app browser and local MITM/domain-fronting tools.
- Core Manager / addon packs: Tor, pluggable transports, ByeDPI, sing-box, mihomo, Snowflake, Lyrebird, WebTunnel, hev-socks5-tunnel, geo assets, and future addon packs.
- Foreground service notification, Quick Settings tile, boot auto-connect.
- App widgets: Quick Connect and Control Panel widgets.
- Hotspot/share screen and local sharing tools.
- Warp registration/screen and Warp-related tools.
- BPB Panel screen and tools.
- Crash/stability fixes from existing release notes: MITM stop FGS crash fix, VPN `onDestroy` ANR fix, large subscription CursorWindow overflow handling, residual VPN FGS timeout prevention.
- Geo pack hardening: minimum size + marker validation, avoid corrupt `geosite.dat` producing `geosite:ir` EOF failures, Core Manager CTA on geo failures.
- Core resilience: watchdog debounce, one-shot auto-reconnect on engine flap, SOCKS port bind reclaim, connect debounce, core/addon download retries.
- HTTP `generate_204` site fetch probe next to ping so dead tunnels that only answer TCP are detected.
- Xray TUN routing fixes: LocalDNS + sniffing, Android API 26–28 TUN guards, explicit gVisor TUN stack.
- Domain-fronting parity: keep configured CDN edge IPs for TLS/WS fronts; only force origin dial for REALITY.
- Internal browser route through Xray `http-in` because app UID is excluded from TUN.
- Firebase Crashlytics/Performance/Analytics behavior only if privacy rules are satisfied; preserve `PiiScrubber` semantics.
- Languages: English, Persian, Russian; preserve RTL and run `scripts/gates/string-key-parity.sh` in CI.

### 5.2 V2RayEZ-GUI / Aether adapter donor behavior (not final GUI)

Preserve and merge:

- Windows + Android client behavior on Aether v1.7.0 and sing-box routing engine.
- Tauri Windows architecture (`src-tauri`) and web-view UI behavior.
- Android donor shell behavior and update worker/receiver, only when adapted behind V2RayEZ.
- System-wide routing mode and local SOCKS5 mode.
- Transactional single-session routing-helper and sing-box lifecycle management.
- Recovery for stale donor-created/V2RayEZ-owned TUN adapters and broken routing sessions.
- Sanitized sing-box exit diagnostics.
- Scan Mode and protocol-specific MASQUE transport controls.
- Exact protocol names/validation where used: `masque`, `wg`, `gool`; MASQUE transport `h3` or `h2`; obfuscation profiles `balanced`, `aggressive`, `light`, `off`, and MASQUE-specific `firewall`, `gfw`, `off`.
- Migration of legacy MASQUE obfuscation values without confusing them with Scan Mode.
- DNS leak protection, IPv6 tunnel behavior, kill switch, quick reconnect, split application selection.
- English and Persian translations with RTL support.
- Update checks at startup and every 12 hours, manual check button, version display, GitHub release notes, progress UI.
- Automatic update download preference.
- Android DownloadManager resumable downloads and duplicate notification prevention.
- Windows official x64 setup download with progress inside app.
- SHA-256 verification on all downloads.
- Android same-signing-certificate verification before install via FileProvider/package installer.
- Update URLs restricted to official release sources unless explicitly configured and verified.
- Preserve requested V2RayEZ wording/status behavior: disconnected `V2RayEZ Ready`, connected `V2RayEZ Active`, real VPN exit location display, bold Ping label/value, Traffic label, no duplicate About entry.

### 5.3 EasySNI

Preserve EasySNI as a distinct tooling/component set exposed through V2RayEZ Tools and desktop/local web surfaces:

- Single-binary Go local web panel behavior where applicable.
- SNI Tunnel: local TCP proxy that performs TLS handshake with fake/front SNI and reaches the true target, with DPI-desync options.
- DPI-desync: TCP fragmentation, fake/decoy packet injection, out-of-order handling where OS allows it.
- uTLS fingerprint options.
- Xray and sing-box detection/download/update; SOCKS5 and TUN modes.
- Full client-side domain-fronting MITM proxy (`mitmdf`): local CA, reads true Host header, maps host suffix to front SNI/dial host, fronted DoH resolution, live host/error logging.
- Editable Host → Front-SNI → Dial-host rules.
- DoH presets: Cloudflare, Google, Quad9, plus app-wide resolver list where present.
- Config library: groups, subscriptions, saved SNI/spoof list, structured V2Ray editor, QR sharing, bulk speed tests, right-click/multi-select desktop behavior.
- Scanners/tools: SNI Scan, Mass SNI, Clean IP Scanner, CDN Edge Test, CDN Config Builder, Mass URI Tester, live-progress Site Scanner with start/status/stop/pause/resume where implemented.
- Google Tunnel / Fastly relay: generate Google Apps Script `Code.gs` plus Cloudflare Worker `worker.js` inside the app.
- Cloudflare Worker generator and EdgeTunnel generator.
- BPB Panel compatibility: preserve BPB config format, UUID/password/path generation, verification, deployment, and worker JS assets; do not reduce it to generic worker deployment.
- SPlus tunnel implementation: relay, SOCKS5, transport, LiveKit-backed variant if build tags/dependencies are enabled.
- Psiphon integration with real build tags for release.
- System proxy management via `sysproxy` for Windows/Linux/macOS where supported, with safe restore on exit/crash.
- WinDivert management and Windows-specific controls.
- TUN-to-SOCKS integration via `tun2socks`.
- GitHub downloader (`ghdl`) for core binaries with checksum verification.
- Server/web panel assets and API handlers, including: parse URI, SNI scan, relay test, mass scan, CF scan, proxy start/stop/status, SPlus start/stop/status, Xray test/mass/CDN-config, site scan state, saved SNI save/load, GTunnel scripts/start/stop/status/CA, MITM defaults/start/stop/status/CA, Xray update configs, QR, Edge UUID/generate, subscription import, config JSON/store/folder load/save, mobileconfig/phone helper endpoints where present.
- Modern light/dark UI, Persian/English fluid layout.

The EasySNI internal modules must remain distinct components: `mitmdf`, `logbus`, `server/web`, `netutil`, `sysproxy`, `tun2socks`, `psiphon`, `ghdl`, `protocol`, `desync`, `gtunnel`, `singbox`, `windivert`, `xray`, `winctl`, `splus`, `proxy`, `tor`, `edgetunnel`, `bpb`, and `sni`.

### 5.4 MICAFP-UnifiedShield vip-ultra-Quantum-ultra

Preserve MICAFP’s full architecture and module inventory.

#### 5.4.1 Rust daemon/core modules

All module families in `MICAFP/daemon/src/` must be kept and wired into the canonical core:

- `ai`: `dpi_classifier`, `adversarial_traffic`, `feature_extractor`, `onnx_runtime`, `rl_transport_selector`, `traffic_predictor`, `ucb_bandit`.
- `battery`: `adaptive_duty`, `coalesced_timer`, `optimizer`, `power_state`.
- `config`: `endpoint_manager`, `ipfs_updater`, `isp_profile`, `isp_profiles`, `schema`.
- `ipc`: `unix_socket`, `named_pipe`, `protocol`.
- `cores`: `hiddify`, `xray`, `singbox`, `amneziavpn`, `defyx`, `moav`, `lantern`, `mahsang`, `psiphon`, `core_manager`.
- `load_balancer`: `swrr`, `session_affinity`, plus EWMA latency behavior where present.
- `mesh`: `gossip_protocol`, `mesh_coordinator`, `mesh_crypto`, `topology_manager`.
- `monitoring`: `prometheus_exporter`, `health_checker`, `latency_tracker`, `alert_manager`.
- `national_intranet`: `nain_detector`, `intranet_detector`, `iran_ip_ranges`, `local_dns_resolver`, `fallback_routing`, `sms_bootstrap`, `ble_mesh`, `wifi_aware`, `acoustic_covert`, `ntp_covert`.
- `obfuscation`: `http3_masquerade`, `packet_size_normalizer`, `steganographic_header`, `timing_jitter`, `tls_fragment`, `traffic_shaper`, `utls_fingerprint`, `wasm_obfuscator`, `websocket_tunnel`.
- `orchestrator`: `control_plane`, `failover`, `health_monitor`.
- `p2p`: `libp2p_discovery`, `i2p_overlay`, `yggdrasil_overlay`, `nat_traversal`, `peer_exchange`, `relay_selection`.
- `platform`: `android`, `ios`, `linux`, `windows`, plus Windows GoodbyeDPI and Linux zapret integration where present.
- `quantum`: `hybrid_handshake`, `pqc_key_store`, `lattice_onion`, `neural_steganography`, `qkd_simulation`, `quantum_noise`, `quantum_obfuscator`, `quantum_ratchet`, `quantum_seed_protocol`, `zkp_auth`, `homomorphic_routing`.
- `resilience`: `watchdog`, `circuit_breaker`, `retry_policy`, `fallback_chain`.
- `scanner`: `adaptive_engine`, `ai_orchestrator`, `autonomous_engine`, `candidate_graph`, `dns_scanner`, `dpi_scanner`, `evidence_fusion`, `network_assessor`, `port_scanner`, `self_healing_failover`.
- `security`: `anti_forensics`, `device_secret`, `ephemeral_identity`, `post_quantum`.
- `telemetry`: `aggregator`, `dp_noise`, `reporter`.
- `transport`: `cdn_tunnel`, `cdn_worker`, `chinese_cdn`, `cloudflare_worker`, `doh_tunnel`, `domain_fronting`, `doq_tunnel`, `hysteria2`, `icmp_tunnel`, `manager`, `meek`, `mqtt_tunnel`, `mqtt_ws`, `multihop_chain`, `naive_proxy`, `pluggable_transport`, `reality`, `shadow_tls`, `tuic_v5`, plus any other transport present.
- `transport/dual_mode`: `mode_a_fast`, `mode_b_layered`, `scheduler`, `tun_pipeline`, `ffi_bridge`, `benchmarks`, `tests`.
- `tunnel`: `tun_device`, `split_tunnel`, `wireguard`, `amneziawg`, `boringtun_adapter`.
- `watchdog` and `metrics` modules.

Also preserve `MICAFP/core/micafp-transport-core/`: Mode A multipath, Mode B layered, scheduler, TUN loop, Android FFI, iOS FFI, config, benchmarks, tests.

#### 5.4.2 MICAFP protocols/transports

Required superset:

- VLESS, VMess, Trojan, Shadowsocks.
- XTLS-Reality / REALITY-compatible behavior.
- Hysteria2, TUICv5, NaïveProxy, ShadowTLS/ShadowTLSv3.
- Meek.
- DNS-over-HTTPS tunnel and DNS-over-QUIC tunnel.
- ICMP tunnel.
- MQTT and MQTT-over-WebSocket tunnel.
- WebRTC relay.
- WebTransport.
- Domain Fronting.
- CDN tunnel: generic, Cloudflare Worker, Alibaba, Tencent, Huawei, Baidu, ByteDance, Arvan, CloudFront, Fastly where data/configs support them.
- Multihop chaining.
- Pluggable transports: obfs4, Lyrebird, Snowflake, WebTunnel where present.
- WireGuard, AmneziaWG, WireGuard Noise variants.
- MASQUE over HTTP/3; preserve any verified MASQUE pseudo-header quirks from MSN-GUARD/Aether and never add broken HTTP/2 fallback where source explicitly says it is invalid for a transport.
- WARP-on-WARP.
- Psiphon, including SSH+Obfs and CDN-fronting roles.
- Tor, including Tor-over-WARP.
- SOCKS5 local proxy mode.
- MoaV Tunnel, MVLESS, VLESS Fragment, FakeHost, Defyx P2P-assisted modes where present.

#### 5.4.3 MICAFP named VPN core inventory

Preserve exact identities, versions, roles, and carrier preferences:

| # | Core | Protocols | Role |
|---|---|---|---|
| 1 | hiddify-core v4.1.0 | VLESS Reality, VMess, Trojan, Hysteria2, TUICv5, ShadowTLSv3, NaiveProxy | Primary orchestration core |
| 2 | GFW-knocker/Xray-core v25.8.3-mahsa-r1 | VLESS Fragment, MVLESS, WireGuard Noise, FakeHost | Iran-specialized |
| 3 | sing-box v1.14.0-alpha.25 | Hysteria2, TUICv5, ShadowTLSv3, NaiveProxy | Protocol management |
| 4 | AmneziaVPN / awg-go 4.8.15.4 | AmneziaWG 1.5 with junk headers | AmneziaWG engine |
| 5 | DefyxVPN v5.2.8 | VLESS Reality, AmneziaWG 1.5 | High-speed P2P-assisted |
| 6 | MoaV v1.7.7 | MoaV Tunnel | Adaptive dynamic key rotation |
| 7 | Lantern v7.9.0 | Domain Fronting, Pluggable Transports | Fronting/PT fallback |
| 8 | MahsaNG core v26.3.31-mahsa-r1 | MVLESS, WireGuard Noise, VLESS Fragment | Iran-tuned |
| 9 | Psiphon (GFW-knocker fork) | SSH+Obfs, CDN Fronting | Last-resort serverless backup |

Carrier-specific preferences:

- MCI / Hamrah-Aval → MahsaNG + AmneziaVPN.
- IranCell → hiddify-core + DefyxVPN.
- Shatel → AmneziaVPN + Psiphon.
- Asiatek → MahsaNG + hiddify-core.
- Rightel → DefyxVPN + hiddify-core.

Add Auto mode that detects carrier/ASN/connection type and selects the right profile without overwriting per-carrier settings.

#### 5.4.4 MICAFP AI/ML and training pipeline

Runtime AI engines:

- DPI classifier.
- Adversarial traffic generator.
- Feature extractor.
- ONNX runtime integration for swappable models.
- Reinforcement-learning transport selector.
- Traffic predictor.
- UCB multi-armed-bandit route selector.

Training pipeline under `MICAFP/ai-models/` must remain runnable:

- `train/dataset_collector.py` — real traffic dataset collection.
- `train/adversarial_traffic_gan.py` — GAN-based adversarial traffic generation.
- `train/traffic_predictor_train.py`.
- `train/feature_engineering.py`.
- `train/dpi_classifier_train.py`.
- `quantize/quantize_models.py` and `quantize/validate_onnx.py`.
- Preserve `requirements.txt`, dataset paths, ONNX export/validation, quantization, and reproducible training docs.

#### 5.4.5 MICAFP mesh/P2P/national intranet

Preserve:

- Wi-Fi Aware/NAN bridge, BLE mesh, gossip protocol, topology manager, mesh crypto, mesh coordinator.
- libp2p discovery with Kademlia DHT; serverless peer lookup.
- Node roles: Source inside Iran → Relay in any country → Exit in a free-country internet environment.
- Per-hop onion-style encryption layering.
- NAT traversal via libp2p hole punching.
- Peer exchange and relay selection.
- Relay incentive system: users who relay earn priority for their own traffic.
- Reputation/trust scoring over time.
- I2P overlay, Yggdrasil overlay.
- National Intranet Mode with levels Smart / Essential / Full.
- Domestic services allowlist for Iranian banking, government, telecom, education, health, news, emergency/essential categories.
- Shutdown/throttling/intranet detection and automatic fallback.
- SMS bootstrap, Android `SmsBootstrapReceiver`.
- Offline mesh through BLE and Wi-Fi Aware.
- Covert channels: `acoustic_covert` and `ntp_covert`, implemented as opt-in emergency resilience modules with clear labels.

#### 5.4.6 MICAFP platform layers

Preserve:

- Android extra code: `AntiForensicsReceiver`, `SmsBootstrapReceiver`, `NanBridge`, `BatteryOptimizer`, `BatteryOptimizationHelper`, `QuickSettingsTile`, `ShieldVpnService`, `VpnService`.
- iOS: `AdvancedSecurityBridge.swift`, `BatteryManager.swift`, `BleMeshManager.swift`, `PacketTunnelProvider.swift`, `AcousticReceiver.swift`, `UnifiedShield` Swift app views, `CoreBridge`, `DpiDetector`, `KillSwitch`, `TunnelManager`, `OtaManager`.
- Linux: CMake, `ipc_client.cpp`, `main.cpp`, `systemd_service.cpp`, `tun_interface.cpp`, Prometheus client, `unifiedshield.service`, Debian/RPM/Arch packaging.
- OpenWrt: root Makefile, daemon C sources, `netifd_proto.c`, `uci_config.c`, `/etc/config/unifiedshield`, LuCI controllers/views/models (`status`, `advanced`, CBI model), bundled Iran IP ranges.

#### 5.4.7 MICAFP dashboard and workers

Keep the existing Next.js dashboard as a **monitoring/control-plane dashboard**, separate from the license issuer admin panel unless navigation clearly separates them.

Dashboard stack: Next.js + React + shadcn/ui + Zustand + Prisma + Tailwind.

Preserve API routes including, at minimum:

- `advanced-analytics`
- `ai-engine`
- `auto-reconnect`
- `cores`
- `dpi-test`
- `geo-router`
- `health`
- `intranet-mode`
- `kill-switch`
- `mesh-network`
- `network-analyzer`
- `obfuscation`
- `orchestrator`
- `ota`
- `p2p-peers`
- `resilience`
- root `route`
- `security-audit`
- `speedtest`
- `threat-intel`

Preserve Prisma models already present:

- `User` with role enum `ADMIN`, `OPERATOR`, `USER` and bcrypt password.
- `Session` with token, IP, user agent, expiry.
- `Core`, `Connection`, `CoreTest`, `P2PPeer`, `ThreatReport`.
- `DpiSignature`, `IntranetDomain`, `AuditLog`, `SystemConfig`.

Preserve CDN/worker code:

- Alibaba CDN worker.
- Arvan CDN worker.
- Baidu CDN worker.
- ByteDance CDN worker.
- Cloudflare worker.
- Deno relay with websocket bridge.
- Huawei CDN worker.
- Tencent CDN worker.
- Universal worker.

#### 5.4.8 MICAFP data assets

Preserve exact JSON content and schemas; do not rewrite to empty demo data:

- `configs/cdn-endpoints.json`: Alibaba/Tencent/Baidu/Huawei plus CloudFront/Fastly, relay selection strategy, failover policy.
- `configs/cloudflare-workers-urls.json`: proxy-chain config, failover config, Chinese-CDN relay list.
- `configs/dpi-signatures.json`: standalone DPI signature database kept in sync with Rust detection logic.
- `configs/iran-ip-ranges.json`.
- `configs/isp-profiles.json`: includes `isp_detection` and per-ISP profiles.
- `configs/p2p-bootstrap-peers.json`: real libp2p multiaddr bootstrap peers with country, relay capacity, bandwidth, 30-day uptime; includes `arvan_hosted_peers`, `yggdrasil_seed_peers`, `mqtt_reachable_peers`, `i2p_floodfill_routers`.
- `configs/pluggable-transports.json`: meek, snowflake, obfs4 and selection strategy.

#### 5.4.9 MICAFP browser extensions

Carry forward Chrome and Firefox companion extensions:

- Separate Chrome and Firefox manifest/background/content/options/popup implementations.
- Shared TypeScript core in `extensions/shared/`: `webtransport_tunnel.ts`, `isp-database.ts`, `iran-ip-ranges.ts`, `protocol.ts`, `dpi-signatures.ts`, `crypto-utils.ts`.
- WASM obfuscation crate in `extensions/wasm-obfuscator` / `wasm-obfuscator`; compile to WASM and load in extensions.
- Preserve browser-side WebTransport tunneling, PAC/proxy manager, DoH resolver, ISP detector, WebRTC relay where present.

### 5.5 MSN-GUARD

Preserve:

- Android-only whole-device VPN shell with real `VpnService` + TUN, not just a browser proxy.
- Rust/Aether network core and Kotlin UI/lifecycle.
- Five transport families: MASQUE over HTTP/3, WireGuard, WARP-on-WARP, Psiphon, Tor.
- Tor bridge modes exactly: Direct, Meek, obfs4, Snowflake. Preserve Tor-over-WARP chaining.
- Psiphon-over-WARP support; preserve JNI/TUN leg that makes Psiphon point to an upstream WARP SOCKS listener.
- Exit-country picker: 27 Tor countries and 25 Psiphon countries where source data supports this; show live relay/server counts.
- One-click connection with automatic gateway selection/recovery.
- Userspace UDP/QUIC bridging for video, voice, and gaming.
- Live status: exit IP, flag/country, data usage, duration, logs.
- Quick Settings tile and split tunneling.
- True kill switch: no plaintext leak when tunnel drops.
- DNS enforcement to public resolvers only; exclude carrier DNS.
- Verified connect: do not mark connected until HTTP 204 probe, DNS resolution, and a traffic sample pass through the tunnel.
- Carrier-specific tuning based on measurement.
- Android `VpnService.protect()` / socket protection registration on every core outbound transport socket to prevent TUN routing loops. This is critical and must be tested.
- badvpn/lwIP/tun2socks pieces from the Android C/C++ tree where still required by Psiphon/TUN bridging.

### 5.6 UAC-SNI-Spoofer-Android

Preserve:

- Device-wide VpnService + Xray + native TUN path.
- `libv2ray-native-tun.aar` and native assets: `libxray.so`, `libtor.so`, `libwebtunnel.so`, `libhev-socks5-tunnel.so` across available ABIs.
- VLESS/VMess/Trojan profile fidelity: SNI, Host, Path, ALPN, fingerprint, transport/security settings must round-trip exactly through import/export/editor.
- Adaptive Connection: network fingerprint from carrier/ASN/connection type; route ranking; learn successful routes; reuse winners; Champion + Backup caches per config/network; cooldown for repeatedly failing routes.
- Carrier edge pools and Direct Compatibility route.
- Automatic recovery on network change.
- Route Speed Test: Edge × DNS × Fragment × MTU matrix; multi-stage competition: qualification → stability → stress → final A/B/B/A.
- Scoring: latency, jitter, throughput, success rate, confidence.
- Independent DoH resolvers: Cloudflare, Google, Quad9, AdGuard, OpenDNS, plus existing resolver list.
- Config Maker: Quick Scan and Deep Adaptive Test.
- Import from text/clipboard/file/subscription with non-destructive merge and deduplication.
- App routing modes: all apps, bypass selected, tunnel only selected.
- Advanced controls: Fragment, FinalMask, MTU, Mux, Keepalive, QUIC.
- Live monitoring: ping, traffic, country, exit IP; Quick Settings tile.
- Tor/WebTunnel subsystem: WebTunnel bridge parser/catalog, bundled `tor/bridges-webtunnel.txt`, last-good bridge per network, live WebSocket/HTTP 101 bridge probe, ranked bridge launch batches, Tor status store, Tor country handling, hev-socks5-tunnel bridge.
- Runtime diagnostics, health guard, connectivity probe, socket protector.
- App UI features: advanced settings screen, app bypass screen, configs screen, live logs, route speed test screen, SNI maker screen, support screen, remote navigation/TV focus where present.
- Third-party notices and assets: Xray-core MPL-2.0, Vazirmatn font SIL OFL, flag-icons/FlagCDN MIT, hev-socks5-tunnel MIT.

### 5.7 UAC-SNI-Spoofer-Windows

Preserve the fact that this is a Python desktop application, not a C++/C# rewrite. It may be wrapped/packaged into the Windows product, but behavior and modules must remain traceable.

Required modules/features:

- Source modules: `engine.py`, `network.py`, `gateway.py`, `models.py`, `storage.py`, `app_config.py`, `ui.py`, `tls_tools.py`, `fragment_proxy.py`, `sni_maker.py`, `sni_maker_widgets.py`, `sni_batch.py`, `verified_configs.py`, `update_checker.py`, `device_names.py`, `icons.py`, `paths.py`, `npcap.py`, `pattern_core/core.py`, `pattern_core/packet_templates.py`.
- Npcap low-level packet capture support.
- Patterniha SNI-spoofing logic and packet templates.
- Xray-based local SOCKS/HTTP tunnel.
- Optional system-wide sing-box TUN for Windows TCP/UDP.
- Per-carrier profiles: MCI/Hamrah Aval and IranCell from source; extend to Shatel, Asiatek, Rightel using MICAFP preference rules without overwriting MCI/IranCell behavior.
- Auto carrier/ASN mode.
- Mobile Gateway: auto-discover LAN devices, route their traffic through active connection without manual proxy/static-IP setup, show device list and per-device status.
- Live SNI and Edge scanning/ranking.
- MCI TLS startup optimization.
- YouTube route warmup.
- Suggested settings from real page tests and bounded download tests.
- App Bypass, live logs, public IP check.
- Advanced Route/SNI/DNS/Timeout/Fallback settings.
- GitHub Releases update checker.
- Safe Windows proxy restore after disconnect/exit/restart.
- Intelligent ICMP handling: ping/ICMP direct over physical interface when proxy protocols do not carry ICMP, while web/video traffic stays tunneled.
- Animated Wizard guide with exactly eight image states: normal, thinking, waiting, happy, sad, guiding_right, confused, surprised. Keep `assistant.py` behavior/state machine separate from `assistant_messages.py` localized text.
- Portable packaging through existing spec/build scripts.

### 5.8 MasterDnsVPN

Add DNS-request/response tunneling as a first-class transport named **DNS Tunnel** / **MasterDnsVPN DNS Transport**. It is distinct from DoH/DoQ tunnels.

Preserve:

- Low-overhead proprietary framing (~5–7 bytes per packet where source achieves it).
- ARQ retransmission layer.
- Multipath over multiple DNS resolvers.
- Selective packet duplication.
- Resolver health checks with auto-disable and background auto-reenable.
- Auto path-MTU discovery/sync; upload/download MTU and character-budget tracking.
- Configurable encryption methods: no-crypto when explicitly allowed, XOR low-overhead, ChaCha20, AES-GCM variants as implemented by method IDs.
- Optional compression: OFF, ZSTD, LZ4, ZLIB; minimum-size threshold; decompression bomb cap.
- Local DNS resolver and persistent cache to reduce hijacking/latency.
- SOCKS5/SOCKS4 local proxy optimizations.
- SOCKS UDP Associate support where present.
- TCP forwarding mode so Shadowsocks/VLESS/VMess/Trojan/etc. can ride inside the DNS tunnel as last-resort transport.
- Failover across paths and adaptive routing based on latency/loss.
- Packed control blocks / lower control overhead.
- Request packing and batching.
- Session init racing/retry/backoff.
- Deferred sessions, invalid-cookie tracking, stream lifecycle cleanup, fragment store, inflight manager.
- Base encoding implementations: lowerbase32, lowerbase36, rawbase64.
- DNS parser/transport policy and many DNS record types from the source parser.
- Client/server TOML configs: `client_config.toml`, `server_config.toml`, resolver file, and all documented variables.
- Eight selectable resolver balancing strategies, preserving exact behavior: Random, Round Robin, Least Loss, Lowest Latency, Hybrid Score, Loss Then Latency, Least Loss Top Random, Least Loss Top Round Robin; preserve default/alias behavior where the source uses it.
- Server policy sync: server-enforced min/max settings, MTU limits, backward compatibility with legacy session accept payload.
- Linux server auto-install script.
- Dockerfile, docker-compose, buildx multi-platform scripts, entrypoint.
- MikroTik/RouterOS usage documentation and port-53 NAT guidance.
- Built-in benchmarks and all Go tests.
- Guided server setup flow in the app/admin tooling: A record for nameserver, NS delegated subdomain, UDP/TCP 53 firewall/NAT, config generation, key handling, propagation checks using `dig`/`nslookup`, Docker and Linux install paths.

---

## 6) New feature: AI Provider Gateway

Build from scratch and expose as a settings panel named **AI Engine**.

Purpose:

- External AI APIs are optional helpers for diagnostics, config suggestions, explanations, and operator assistance.
- Core VPN/anti-DPI operation must never depend on external API availability or API keys.
- The internal MICAFP AI stack is the load-bearing fallback.

Requirements:

- Provider-agnostic adapter interface with no hardcoded provider lock-in.
- Configurable via JSON file and in-app form:
  - provider display name
  - base URL
  - endpoint path
  - HTTP method
  - auth type and auth header template
  - request body schema template
  - response extraction template/path
  - model name
  - timeout/retry/proxy policy
  - censorship probe strategy
- Support common shapes without code changes: OpenAI-style chat/completions, Anthropic-style messages, Gemini-style REST, and generic REST JSON.
- “Test & Auto-detect” button:
  - probes endpoint reachability through direct and active-tunnel paths
  - detects response shape
  - validates auth header placement
  - stores a working adapter profile
  - marks blocked/unreachable providers
- Automatic fallback:
  - if external endpoint is unreachable, blocked, rate-limited, unauthenticated, or disabled, use local MICAFP AI engines.
  - anti-DPI/route selection continues with zero external dependency.
- Secure secret storage:
  - Android Keystore, iOS Keychain, Windows DPAPI, Linux Secret Service/libsecret or encrypted local fallback, OpenWrt protected UCI/file with clear permissions.
  - Never log API keys or send them to telemetry.
- Add provider import/export with redacted secrets.
- Add tests with mock OpenAI/Anthropic/Gemini/generic endpoints and blocked-network simulation.

---

## 7) New feature: Licensing / serial-number system

Build from scratch, extending the existing MICAFP dashboard Prisma schema instead of creating a parallel auth system.

### 7.1 Data model

Extend the existing Prisma schema:

- Add `License` related to `User`.
- Add independent `expiresAt` per license/user.
- Add fields for license key hash, signed license payload, status, issuedAt, revokedAt, renewedAt, lastValidatedAt, offlineGraceUntil, maxDevices, metadata.
- Add device activation model if needed: deviceId/accountId binding, hardware/device fingerprint hash, platform, firstSeenAt, lastSeenAt, revokedAt.
- Preserve existing `User`, `Session`, `AuditLog`, roles, and dashboards.

### 7.2 Cryptography and anti-forgery

- License keys/tokens are signed by the server with Ed25519 or stronger modern signature.
- Clients verify signature locally using embedded public key(s).
- Key rotation supported with key IDs.
- A locally edited key must fail verification.
- Clock rollback must not bypass expiration:
  - validation endpoint returns signed server timestamp and short-lived grace token.
  - client stores monotonic last-seen server time.
  - grace token has explicit expiry and signature.
  - suspicious clock rollback forces online validation.
- License validation must bind account + device + platform + license ID.
- Revoked licenses stop working on the next online validation and after grace token expiry if offline.

### 7.3 Enforcement

- VPN/tunnel functionality is gated in the unified Rust core before any transport starts.
- If license is expired/revoked/invalid and no valid grace token exists, the tunnel refuses to start.
- Automatic hard cutoff when expiration time is reached; active tunnels must stop cleanly and enforce kill switch/no leak where configured.
- No partial degradation that can be bypassed from UI.
- Offline grace period default: 72 hours, configurable server-side per license but signed.
- License checks must not block non-network settings screens or license renewal UI.

### 7.4 Admin/issuer dashboard

Add a separate **License Admin / Issuer** area to the existing Next.js dashboard navigation:

- Issue license for user.
- Revoke license.
- Extend/renew license with per-user expiry date.
- Change max device activations.
- View validation history and device activations.
- Audit all actions through `AuditLog`.
- Role enforcement: only `ADMIN` or authorized `OPERATOR` can issue/revoke/renew.

### 7.5 Client UI

- Activation screen: manual serial/license entry and account sign-in/linking.
- Renewal screen: in-app purchase hook where available plus manual key/renewal code entry.
- Clear expiry countdown UI in existing V2RayEZ style.
- Calm inline warnings before expiry; no noisy popups.
- Works on Android, iOS, Windows, Linux, OpenWrt LuCI.

### 7.6 REST API documentation

Document and implement:

- `POST /api/licenses/issue`
- `POST /api/licenses/validate`
- `POST /api/licenses/revoke`
- `POST /api/licenses/renew`
- `GET /api/licenses/:id`
- `GET /api/users/:id/licenses`
- device activation endpoints if needed

Each endpoint must specify auth, request, response, error codes, signature fields, audit logging, and security rules.

---

## 8) Device-wide tunneling, leak prevention, and reliability

Implement consistently across platforms:

- Real OS-level TUN/VPN path where supported:
  - Android `VpnService`.
  - iOS Network Extension Packet Tunnel Provider.
  - Windows WinTun/sing-box system TUN.
  - Linux TUN device/systemd.
  - OpenWrt network interface/netifd integration.
- Socket protection / route exclusion:
  - Android: register `VpnService.protect()` callback for core outbound sockets.
  - iOS/Windows/Linux/OpenWrt: equivalent routing rules to prevent core sockets looping back through TUN.
- Kill switch: full network cutoff if tunnel drops; no plaintext leak.
- DNS enforcement: public resolvers only: Cloudflare, Google, Quad9, AdGuard, OpenDNS, with DoH and bootstrap addresses; carrier DNS excluded unless explicitly in National Intranet essential mode.
- Verified connect: only report connected once HTTP 204 probe, DNS resolution, and throughput sample pass through the tunnel.
- UDP/QUIC bridge in userspace for video/voice/gaming.
- Split tunneling/per-app routing modes: all apps, bypass selected, tunnel only selected.
- ICMP handling: route ping directly over physical interface when selected proxy protocols cannot carry ICMP, so latency tools show real values while web/video traffic remains tunneled.
- Shadow connections: keep warm backup core/route and switch active core in under 2 seconds with no perceptible drop.
- Watchdog with debounce; avoid reconnect flapping.
- Circuit breaker, retry policy, fallback chains.
- Load balancing: weighted round robin, EWMA latency, session affinity.
- Battery-aware adaptive duty cycling on mobile.

---

## 9) Anti-DPI and obfuscation stack

Preserve and integrate:

- REALITY/XTLS-Reality-compatible TLS camouflage and fallback.
- uTLS fingerprinting matched to real Chrome/NaïveProxy-style behavior.
- Randomized protocol padding: 64–1024 bytes, automatically available for every transport where technically possible.
- DPI-desync: TCP fragmentation, fake packets, out-of-order segments, OS-specific raw packet paths.
- Domain fronting intelligently restricted by region: Alibaba/Tencent/Arvan/other reachable options prioritized for Iran; Cloudflare flagged as domestically blocked but preserved for users/regions where it works; Cloudflare Worker support remains.
- MICAFP nine obfuscation engines and WASM browser obfuscator.
- DPI signature detection and dedicated bypass path for: TLS Reset, HTTP 403, Null Route, SNI filter, DNS poisoning.
- Standalone `dpi-signatures.json` kept synchronized with Rust-side detection.
- Security audit: DNS leak test, WebRTC leak detection, encryption-strength assessment, privacy score.

---

## 10) Config management and scanners

Build a unified config system with exact import/export fidelity:

- Import: share link, QR, raw text, clipboard, file, subscription URL.
- Non-destructive multi-subscription merging and automatic duplicate removal.
- Groups, tags, bulk relay test, bulk speed test, desktop right-click/multi-select behavior.
- Structured editors for VLESS, VMess, Trojan, Shadowsocks, WireGuard, AmneziaWG, Hysteria2, TUIC, ShadowTLS, NaïveProxy, Tor/Psiphon modes, DNS tunnel.
- Preserve UAC per-field fidelity: SNI, Host, Path, ALPN, fingerprint, security, transport, mux, keepalive, fragment, MTU, FinalMask, QUIC.
- Export to share links, QR, raw JSON, subscription formats, Clash/sing-box/Xray where supported.
- Scanners: SNI scan, Mass SNI, Clean IP scanner, CDN edge test, CDN config builder, Mass URI tester, live-progress Site Scanner, DPI scanner, DNS scanner, port scanner, adaptive/self-healing scanner.
- Core Manager: detect/download/verify Xray, sing-box, Tor, pluggable transports, Psiphon, DNS-tunnel addon packs, Aether-related binaries, WARP components, geo assets, with SHA-256 verification and safe update/rollback.

---

## 11) OTA updates and supply-chain security

- Preserve useful donor update behavior and MICAFP OTA requirements behind V2RayEZ branding/UX.
- GitHub Releases API integration.
- Delta patching where supported.
- SHA-256 verification for all downloads.
- Android same-signing-certificate verification.
- Signed binaries and checksum manifests.
- Chinese/Iran-reachable CDN mirrors as alternate download paths for censored regions.
- Mirror downloads must verify the same signature/checksum as canonical source.
- Secure rollback on failed update.
- Never execute unverified downloaded binaries.

---

## 12) Third-party attribution and licensing

Create/maintain consolidated `THIRD_PARTY_NOTICES.md` and preserve source notices/licenses:

- Xray-core v26.7.28 — MPL-2.0.
- Vazirmatn Persian UI font — SIL OFL 1.1.
- flag-icons / FlagCDN country flags — MIT.
- `hev-socks5-tunnel` — MIT.
- sing-box, Aether, Psiphon, Tor, obfs4/Lyrebird/Snowflake/WebTunnel, WinDivert, Npcap notices as applicable.
- Preserve EasySNI, MasterDnsVPN, MICAFP, V2RayEZ-GUI Aether-adapter donor, MSN-GUARD, UAC notices and license constraints.
- If any license is incompatible with redistribution, stop and report exact component and mitigation; do not silently bundle it.

---

## 13) Build, CI, and QA gates

CI must run:

- Android unit tests, instrumentation/smoke where available, and universal APK build.
- Kotlin/Compose lint and resource checks.
- `scripts/gates/string-key-parity.sh` for English/Persian/Russian localization parity.
- Rust `cargo test`, clippy, fmt, feature builds including post-quantum lab feature flags.
- Go tests for EasySNI and MasterDnsVPN.
- Python tests for UAC-Windows modules.
- Next.js dashboard lint/build, Prisma generate/migrate validation.
- Browser extension TypeScript build and WASM build.
- iOS `xcodebuild` for app + Packet Tunnel extension; IPA export when signing is configured.
- Windows Tauri build/installer and portable package.
- Linux binary and packages.
- OpenWrt generic SDK `.ipk` build with LuCI app.
- Security tests for license signatures, clock rollback, revocation, secret redaction.
- Telemetry scrubber tests for hosts/URIs/bridges/IPs/PEMs/fingerprints/subscription bodies/API keys/license keys.

---

## 14) Real end-to-end connectivity tests

Do not accept handshake-only tests. At every milestone, run real E2E traffic tests and record evidence.

Minimum required test matrix:

1. TCP/TLS family: VLESS/VMess/Trojan/Shadowsocks/REALITY/NaïveProxy/ShadowTLS.
2. QUIC family: Hysteria2/TUICv5/MASQUE H3/WebTransport where available.
3. WireGuard family: WireGuard/AmneziaWG/WARP-on-WARP.
4. Tor/Psiphon family: Tor Direct, Meek, obfs4, Snowflake, WebTunnel where present, Tor-over-WARP, Psiphon, Psiphon-over-WARP.
5. DNS family: MasterDnsVPN DNS tunnel plus DoH/DoQ tunnel.
6. Domain-fronting/CDN workers: at least one reachable regional CDN path and one Cloudflare Worker path where region permits.
7. Mesh/P2P: local lab test for libp2p DHT/relay and BLE/Wi-Fi Aware where hardware supports it; simulator/emulator fallback must be labeled as non-final.
8. National Intranet Mode: simulated shutdown/throttling/DNS poisoning/null route lab plus real domestic allowlist routing verification where possible.

For each test, prove:

- Tunnel starts only with a valid license.
- HTTP 204 probe succeeds through tunnel.
- DNS resolves through enforced resolver and no carrier DNS leak occurs.
- Throughput sample passes.
- Exit IP/country detection matches tunnel, not real IP.
- Kill switch blocks plaintext after forced tunnel crash.
- Reconnect/failover/shadow connection behavior works.
- Logs/telemetry are scrubbed.

If no real server/config is available for a transport, create a reproducible lab server using Docker/scripts from source or explicitly block completion. Do not fake success.

---

## 15) Implementation milestones

Use milestones, but each milestone must end with real compilable code and tests; no half-implemented TODOs.

### Milestone 0 — Inventory and traceability

- Generate `MERGE_TRACEABILITY.md`, `FEATURE_MATRIX.md`, `UI_CHANGELOG.md` baseline, `TEST_EVIDENCE.md` baseline.
- Build the untouched sources if possible to understand current behavior.
- Identify all binary/vendor/license constraints.

### Milestone 1 — Unified core skeleton with real APIs

- Create canonical Rust core crate/workspace.
- Define stable API: config import/export, license gate, start/stop/status, route test, scanner, core manager, AI gateway, metrics, logs.
- Wire Android JNI, iOS FFI, Windows/Linux/OpenWrt IPC without feature behavior divergence.
- Add no-op placeholders are not allowed; if a backend is not merged yet, it must be hidden behind build/feature flags and not reported complete.

### Milestone 2 — Preserve V2RayEZ Android baseline

- Keep UI/UX locked.
- Ensure existing Android app builds and base V2RayEZ features still work.
- Add core bridge without breaking Xray/import/per-app/Tor/MITM/Core Manager/localization/widgets.

### Milestone 3 — Merge Aether donor behavior + MSN-GUARD on one Aether engine behind V2RayEZ GUI

- Upgrade/keep Aether v1.7.0.
- Merge MASQUE/WireGuard/WARP/Psiphon/Tor behaviors.
- Preserve socket protection, verified connect, kill switch, DNS enforcement, exit country picker, UDP/QUIC bridge.
- Preserve the useful update/routing/Tauri behavior behind the V2RayEZ GUI identity.

### Milestone 4 — Merge MICAFP advanced core

- Port/wire transports, obfuscation, named cores, AI engines, mesh/P2P, national intranet, security/PQ lab, monitoring, telemetry, battery, scanners, dashboards, workers, platform code.
- Preserve data assets exactly.

### Milestone 5 — Merge EasySNI tools

- Integrate SNI tunnel, MITM/domain-fronting proxy, scanners, config library, BPB/EdgeTunnel, Google/Fastly relay generator, SPlus, sysproxy, WinDivert/TUN-to-SOCKS.
- Expose through V2RayEZ Tools and desktop/web panels without UI redesign.

### Milestone 6 — Merge MasterDnsVPN DNS Tunnel

- Add first-class DNS Tunnel transport to core, UI, server/admin guided setup, Linux/Docker packaging, tests.
- Preserve all balancing/encryption/compression/ARQ/multipath/MTU/session features.

### Milestone 7 — Multi-platform shells and packages

- Android APK, iOS IPA, Windows installer+portable, Linux packages, OpenWrt generic IPK+LuCI.
- Keep platform shells thin around the same core.

### Milestone 8 — AI Provider Gateway and Licensing

- Implement AI Engine external provider adapter + local fallback.
- Implement license server/client/admin, per-user expiry, Ed25519 signatures, grace token, hard cutoff, renewal UI, API docs.

### Milestone 9 — Full regression and release

- Run complete feature matrix and E2E traffic tests.
- Fix every regression.
- Produce artifacts, checksums, notices, API docs, deployment docs, and final report.

---

## 16) Final deliverables

Produce:

- Source code for V2RayEZ Universal.
- Android universal `.apk`.
- iOS `.ipa` or explicit signing blocker report if credentials/entitlements are unavailable.
- Windows `.exe` installer and portable package.
- Linux native binary plus package(s) and systemd service.
- OpenWrt universal/generic `.ipk` with LuCI UI.
- Browser extension packages for Chrome and Firefox.
- Worker bundles/scripts for Cloudflare, Alibaba, Tencent, Huawei, Baidu, ByteDance, Arvan, Deno, universal worker.
- License server/dashboard with Prisma migration and API docs.
- AI Provider Gateway docs and sample provider JSON configs.
- DNS Tunnel server setup guide including DNS records, Linux script, Docker, MikroTik/RouterOS notes.
- `MERGE_TRACEABILITY.md`, `FEATURE_MATRIX.md`, `UI_CHANGELOG.md`, `TEST_EVIDENCE.md`.
- `THIRD_PARTY_NOTICES.md`.
- Final report with:
  - features merged
  - files changed
  - builds run
  - artifacts and checksums
  - E2E tests run
  - pass/fail details
  - unresolved blockers
  - proof no listed feature was lost

---

## 17) Completion definition

You may only say the project is complete when all are true:

- Every feature above is mapped to source and target files.
- All five mandatory platform artifacts compile.
- Required browser extensions compile.
- The license gate prevents tunnel start after expiration/revocation and cannot be bypassed by local key edits or clock rollback.
- AI Gateway can add a new provider/model by JSON/form only, without source changes, and falls back to local AI when blocked.
- Real tunnel traffic passes for every transport family in the E2E matrix.
- Kill switch, DNS leak prevention, verified connect, socket protection, and split tunneling pass tests.
- UI/UX remains consistent with the original V2RayEZ/reference video and advanced features are additive.
- Translation parity gate passes for English/Persian/Russian.
- Telemetry scrubber tests pass and no PII/API/license secrets leak.
- Third-party notices are complete.
- No release artifact contains placeholders or stubbed in-scope features.

If any item fails, do not claim completion. Report the exact failure, logs, suspected root cause, and the next fix.
