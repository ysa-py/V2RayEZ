# V2RayEZ Universal Requirement Map

Status date: 2026-09-02. This document is the live, explicit map from the reviewed donor repos and the user's engineering directive into the unified V2RayEZ codebase. It is not a claim that the whole universal product is finished.

Legend:

- **MERGED** — code is present in the unified branch and covered by at least static/source gates.
- **PARTIAL** — a real slice is merged, but more runtime/platform work remains.
- **SOURCE-PRESENT** — donor source exists in this repository and the target home is identified, but it is not fully merged yet.
- **BLOCKED-LOCAL** — implementation may exist, but this sandbox cannot prove native build/device connectivity because required toolchains/devices/servers are unavailable.
- **IMPOSSIBLE-AS-STATED** — physics/security/networking limitation; must be documented rather than hidden.

## 0. Source projects and canonical target home

| Source | Donor path | Canonical V2RayEZ home | Current status |
|---|---|---|---|
| V2RayEZ base app | `V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)` | Android end-user app, V2RayEZ design system, Xray config/import/core shell | PARTIAL / active base |
| AetherGUI / Aethon | `V2RayEZ-GUI` | `universal-core/engines/aether`, desktop/native shells, OTA update logic | SOURCE-PRESENT / PARTIAL |
| EasySNI | `EasySNI- Make sure to fully add all features to the V2RayEZ app` | `universal-core/fronting`, `universal-core/obfuscation`, scanners/tooling | SOURCE-PRESENT / PARTIAL |
| MICAFP-UnifiedShield | `MICAFP` | Shared Rust core, dashboard, AI, mesh, platform layers, browser extensions, data assets | SOURCE-PRESENT / PARTIAL |
| MSN-GUARD | `MSN-GUARD- Make sure to fully add all features to the V2RayEZ app` | Same Aether engine home; Android VpnService/TUN behavior and transport preservation | SOURCE-PRESENT / PARTIAL |
| UAC-SNI-Spoofer Android | `UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app` | Android adaptive routing, exact config fidelity, route racing/speed test | PARTIAL — adaptive memory merged in M61 |
| UAC-SNI-Spoofer Windows | `UAC-SNI-Spoofer-Windows- Make sure to fully add all features to the V2RayEZ app` | Windows profile/SNI/Patterniha/Mobile Gateway compatibility behind V2RayEZ UI | SOURCE-PRESENT |
| MasterDnsVPN | `MasterDnsVPN-main` | First-class DNS tunnel transport and DNS tunnel server tooling | SOURCE-PRESENT |

## 1a. UI/UX standard

| Requirement line | Target home | Status |
|---|---|---|
| V2RayEZ Android UI/UX remains canonical | Android Compose app only | PARTIAL — recent Android features were added without donor UI |
| Do not port AetherGUI/EasySNI/MICAFP/MSN/UAC UI trees | Design/identity gates | PARTIAL — `tools/v2rayez_identity_gate.mjs` protects identity |
| New screens must use V2RayEZ language | Android Compose app components | PARTIAL |
| iOS/Windows/Linux/OpenWrt native shells share design tokens/terminology | future `apps/ios`, desktop, LuCI, shared tokens | SOURCE-PRESENT / not complete |
| LuCI/iOS containers may be platform-native but content remains V2RayEZ | OpenWrt/iOS shells | SOURCE-PRESENT / not complete |

## 1. Target platforms and artifacts

| Platform/artifact | Current home | Status |
|---|---|---|
| Android universal `.apk` | Android Gradle project, split config with universal APK enabled | PARTIAL; BLOCKED-LOCAL because Java/JDK is absent |
| iOS `.ipa` Packet Tunnel | `MICAFP/ios` donor target | SOURCE-PRESENT; BLOCKED-LOCAL, no Xcode/iOS signing/device |
| Windows `.exe` installer + portable | `MICAFP/windows`, `V2RayEZ-GUI`, UAC Windows donor | SOURCE-PRESENT; BLOCKED-LOCAL, no Windows build/runtime |
| Linux native binary + package/systemd | `MICAFP/linux`, `universal-core` | SOURCE-PRESENT; BLOCKED-LOCAL, no Rust/cargo toolchain |
| OpenWrt LuCI `.ipk` generic | `MICAFP/openwrt`, `MICAFP/zig-openwrt` | SOURCE-PRESENT; BLOCKED-LOCAL, no OpenWrt SDK |
| One shared Rust core, no platform forked logic | `universal-core`, `MICAFP/daemon` | PARTIAL; full core merge remains |
| Aether merged once, not duplicated with MSN-GUARD | `universal-core/engines/aether` | PARTIAL / architecture preserved in docs/inventory |

## 2. Core networking features

| Requirement line | Target home | Status |
|---|---|---|
| VLESS / VMess / Trojan / Shadowsocks | Android parser/config builder and future universal config core | PARTIAL |
| XTLS-Reality / uTLS fingerprint / SNI / Host / Path / ALPN round-trip | Android models/parser/config builder | PARTIAL |
| Hysteria2 / TUICv5 / NaiveProxy / ShadowTLS / Meek | MICAFP/Aether/sing-box homes | SOURCE-PRESENT |
| DoH/DoQ tunnel / ICMP / MQTT / WebRTC / WebTransport / MASQUE | MICAFP transports | SOURCE-PRESENT |
| Domain Fronting / CDN tunnels / Worker / Chinese CDN variants | Android fronting + MICAFP configs + EasySNI donor | PARTIAL |
| Multihop / obfs4/Lyrebird / WireGuard / AmneziaWG / WARP / Psiphon / Tor | Android addon/core manager + MICAFP/MSN donors | PARTIAL |
| SOCKS5 local proxy mode | V2RayEZ/Xray/EasySNI/MasterDnsVPN donors | PARTIAL |
| MasterDnsVPN DNS tunnel as first-class mode | `universal-core/transports/dns-tunnel`, server tooling | SOURCE-PRESENT |
| DNS tunnel ARQ, multipath, 8 balancers, resolver health, MTU sync, AES/ChaCha20/XOR, ZSTD/LZ4/ZLIB, DNS cache, SOCKS4/5, TCP forwarding, failover | MasterDnsVPN donor modules | SOURCE-PRESENT; not fully merged |
| DNS tunnel delegated-subdomain setup, Linux install, Docker | MasterDnsVPN scripts/docker/docs | SOURCE-PRESENT |

## 2.2 Anti-DPI / obfuscation

| Requirement line | Target home | Status |
|---|---|---|
| Reality, uTLS Chrome-like fingerprints | Android config builder + core manager | PARTIAL |
| Randomized 64–1024 byte padding | universal core obfuscation | SOURCE-PRESENT / not fully enforced everywhere |
| TCP fragmentation, fake/decoy packets, out-of-order | EasySNI `desync`, Android smart repair | PARTIAL |
| Iran-aware domain fronting with Cloudflare warning, Alibaba/Tencent priority | Android/domain-fronting configs | PARTIAL |
| 9 MICAFP obfuscation engines | MICAFP obfuscation/daemon source | SOURCE-PRESENT |
| EasySNI MITM/domain-fronting proxy with rules, fronted DoH, logs | Android MITM/fronting + EasySNI donor | PARTIAL |

## 2.2a Named core inventory and dashboard

| Requirement line | Target home | Status |
|---|---|---|
| hiddify-core v4.1.0 | universal core manager/engines; Android named inventory | PARTIAL/MERGED inventory M64; native binary proof pending |
| GFW-knocker/Xray-core v25.8.3-mahsa-r1 | universal core manager/engines | SOURCE-PRESENT |
| sing-box v1.14.0-alpha.25 | universal core manager/engines | SOURCE-PRESENT; checksum pinning incomplete |
| AmneziaVPN awg-go 4.8.15.4 | universal core manager/engines | SOURCE-PRESENT |
| DefyxVPN v5.2.8 | universal core manager/engines | SOURCE-PRESENT |
| MoaV v1.7.7 | universal core manager/engines | SOURCE-PRESENT |
| Lantern v7.9.0 | universal core manager/engines | SOURCE-PRESENT |
| MahsaNG core v26.3.31-mahsa-r1 | universal core manager/engines; Android named inventory | PARTIAL/MERGED inventory M64; native binary proof pending |
| Psiphon GFW-knocker fork | universal core manager/engines | SOURCE-PRESENT / PARTIAL |
| Carrier-specific preferences for MCI/IranCell/Shatel/Asiatek/Rightel | Android `AndroidCarrierCoreSelector.kt`, Core Manager, future shared core profile config | PARTIAL/MERGED M64 for Android auto selection; cross-platform runtime proof remains |
| Shadow connections under 2s | dashboard/orchestrator/core manager | SOURCE-PRESENT / not runtime-proven |
| Security audit suite | dashboard + Android diagnostics | PARTIAL |
| DPI signatures and dedicated bypass paths | dashboard + configs + Android diagnostics | PARTIAL |
| OTA updates via GitHub/delta/SHA256/CDN mirrors | dashboard/OTA + Android/admin docs | PARTIAL |
| Dashboard distinct from license issuer/admin | `MICAFP/dashboard` and Android `license-admin` module | MERGED as separate surfaces |
| macOS optional bonus | MICAFP Flutter/macOS donor | SOURCE-PRESENT / non-blocking |

## 2.3 AI and adaptive routing

| Requirement line | Target home | Status |
|---|---|---|
| DPI classifier | MICAFP AI/model runtime | SOURCE-PRESENT |
| Adversarial traffic generator | `MICAFP/ai-models/train/adversarial_traffic_gan.py` | SOURCE-PRESENT |
| Feature extractor | MICAFP AI/model pipeline | SOURCE-PRESENT |
| ONNX runtime integration / swappable models | MICAFP AI/model runtime | SOURCE-PRESENT / PARTIAL |
| RL transport selector | MICAFP AI | SOURCE-PRESENT |
| Traffic predictor | MICAFP AI | SOURCE-PRESENT |
| UCB multi-armed-bandit selector | MICAFP AI | SOURCE-PRESENT |
| UAC adaptive connection fingerprint/champion/backup/cooldown | Android `AndroidAdaptiveRouteMemory.kt` | PARTIAL / MERGED M61 |
| UAC exhaustive Route Speed Test matrix | Android `RouteSpeedTestViewModel` + `RouteSpeedTestScreen` for Edge × DNS × Fragment × MTU; future shared core/cross-platform | PARTIAL/MERGED M65 on Android with A/B/B/A final; real carrier/device proof remains |
| UAC Windows per-carrier profile isolation + Auto | Android carrier auto selector now; Windows/profile selector still pending | PARTIAL/MERGED M64 on Android |

## 2.4 AI provider gateway

| Requirement line | Target home | Status |
|---|---|---|
| Provider-agnostic adapter: base URL, auth, templates | Android AI Engine config/gateway | PARTIAL |
| Test & auto-detect OpenAI/Anthropic/Gemini/generic shapes | Android AI Engine gateway | PARTIAL |
| Fallback to internal/local AI if external blocked | Android AI gateway + MICAFP AI runtime | PARTIAL |
| External key optional, core VPN independent | Android AI settings/docs | PARTIAL |

## 2.5 Mesh/offline/national intranet

| Requirement line | Target home | Status |
|---|---|---|
| Wi-Fi Aware + BLE mesh + gossip + topology manager | MICAFP mesh/national_intranet | SOURCE-PRESENT |
| libp2p Kademlia DHT, I2P, Yggdrasil, hole punching, peer exchange, relay selection | MICAFP P2P configs/core | SOURCE-PRESENT |
| Source→Relay→Exit roles, onion-style layers, incentives, reputation | MICAFP mesh/P2P | SOURCE-PRESENT |
| National Intranet levels Smart/Essential/Full | Android diagnostics + MICAFP national_intranet | PARTIAL |
| `nain_detector` and `intranet_detector` | Android `NationalIntranetDetector.kt` plus MICAFP | PARTIAL |
| `iran_ip_ranges`, `local_dns_resolver`, `fallback_routing` | MICAFP configs/core | SOURCE-PRESENT |
| `sms_bootstrap` | MICAFP Android donor inspected | SOURCE-PRESENT / not safely ported yet |
| `ble_mesh`, `wifi_aware` | MICAFP | SOURCE-PRESENT |
| `acoustic_covert`, `ntp_covert` | MICAFP national_intranet/covert modules | SOURCE-PRESENT / safety-scoped, not merged |

## 2.6 Device-wide tunneling/reliability

| Requirement line | Target home | Status |
|---|---|---|
| Android true VpnService TUN | V2RayEZ Android service | PARTIAL |
| Core socket protect callback | Android VPN/core bridge | PARTIAL / needs native proof |
| iOS Network Extension TUN | MICAFP iOS | SOURCE-PRESENT |
| Windows WinTun/system-wide TUN | MICAFP/UAC/EasySNI Windows | SOURCE-PRESENT |
| Tor Direct/Meek/obfs4/Snowflake/Tor-over-WARP | Android Tor/addon + MSN/UAC donors | PARTIAL |
| Kill switch | Android service/dashboard kill-switch | PARTIAL |
| DNS enforcement public resolvers only | Android/network settings | PARTIAL |
| Verified connect only after traffic passes | Android connection flow needs real probes | PARTIAL / not device-proven |
| UDP/QUIC userspace bridge | MICAFP/MSN donors | SOURCE-PRESENT |
| Split tunneling all/bypass/tunnel-only | Android app routing | PARTIAL |
| Tor/Psiphon exit-country picker | Tor/Psiphon UI/core | SOURCE-PRESENT / partial |
| Windows Mobile Gateway | UAC Windows donor | SOURCE-PRESENT |
| ICMP direct physical-interface rule | routing core target | SOURCE-PRESENT / not merged |

## 2.6a EasySNI modules

| Module | Target home | Status |
|---|---|---|
| `mitmdf` | fronting/MITM | PARTIAL |
| `logbus` | observability/logging | SOURCE-PRESENT |
| `server/web` | tools API; UI must be re-skinned to V2RayEZ if exposed | SOURCE-PRESENT |
| `netutil` | core utilities | SOURCE-PRESENT |
| `sysproxy` | desktop system proxy shell | SOURCE-PRESENT |
| `tun2socks` | TUN bridge | PARTIAL |
| `psiphon` | Psiphon engine | SOURCE-PRESENT |
| `ghdl` | core downloader/checksum manager | SOURCE-PRESENT |
| `protocol` | config protocol core | SOURCE-PRESENT |
| `desync` | anti-DPI | PARTIAL |
| `gtunnel` | Google/Fastly relay | SOURCE-PRESENT |
| `singbox` | core manager/engine | SOURCE-PRESENT |
| `windivert` | Windows packet integration | SOURCE-PRESENT |
| `xray` | Xray manager | PARTIAL |
| `winctl` | Windows control | SOURCE-PRESENT |
| `splus` | SPlus tunnel | SOURCE-PRESENT |
| `proxy` | proxy layer | SOURCE-PRESENT |
| `tor` | Tor engine | PARTIAL |
| `edgetunnel` + `bpb` | Worker/BPB compatibility | SOURCE-PRESENT |
| `sni` | SNI tooling | SOURCE-PRESENT / PARTIAL |

## 2.6b UAC Windows modules

| Module | Target home | Status |
|---|---|---|
| `engine.py`, `network.py`, `gateway.py`, `models.py`, `storage.py`, `app_config.py` | Windows backend/profile integration | SOURCE-PRESENT |
| `ui.py` | backend only; UI not ported | SOURCE-PRESENT / donor UI excluded |
| `tls_tools.py`, `fragment_proxy.py` | SNI/desync tooling | SOURCE-PRESENT |
| `sni_maker.py`, `sni_maker_widgets.py`, `sni_batch.py` | SNI generation; widgets excluded/reimplemented if surfaced | SOURCE-PRESENT |
| `verified_configs.py`, `update_checker.py`, `device_names.py`, `icons.py`, `paths.py` | config/update/device tooling | SOURCE-PRESENT |
| `pattern_core` | Patterniha compatibility | SOURCE-PRESENT |
| `npcap.py` | Npcap integration | SOURCE-PRESENT |
| `assistant.py`, `assistant_messages.py` | logic/text split preserved conceptually; mascot UI excluded | SOURCE-PRESENT |

## 2.7 Config management

| Requirement line | Target home | Status |
|---|---|---|
| Share link, QR, raw text, clipboard, file, subscription URL | Android parser/importers | PARTIAL |
| Non-destructive multi-subscription merge + dedupe | Android repository/parser | PARTIAL |
| Config library groups/tags/bulk relay/speed test/multi-select | Android server library | PARTIAL |
| Structured VLESS/VMess/Trojan/Shadowsocks editor | Android editor target | PARTIAL |
| SNI/Mass SNI/Clean IP/CDN edge/CDN builder/Mass URI/Site scanner | EasySNI/UAC donors + Android tools | SOURCE-PRESENT / PARTIAL |
| Cloudflare Worker + Google Apps Script relay generator in-app | MICAFP workers/EasySNI BPB | SOURCE-PRESENT |
| Core Manager downloads with SHA-256 | Android Core Manager + donor sources | PARTIAL; some checksum pinning incomplete |

## 2.8 Resilience/observability

| Requirement line | Target home | Status |
|---|---|---|
| Watchdog debounce / one-shot reconnect | Android VPN/service | PARTIAL |
| Circuit breaker/retry/fallback chains | dashboard/core selector | PARTIAL |
| Weighted RR + EWMA + affinity | core/adaptive routing | PARTIAL |
| Prometheus metrics/health/latency graphs/alerts | MICAFP dashboard | PARTIAL |
| Differential privacy telemetry with PII scrubbing | Android Firebase telemetry with scrubber | PARTIAL |
| Battery adaptive duty cycling | Android/mobile runtime target | SOURCE-PRESENT / partial |

## 2.8a Data assets

| Asset | Target home | Status |
|---|---|---|
| `cdn-endpoints.json` Alibaba/Tencent/Baidu/Huawei/CloudFront/Fastly | MICAFP configs | SOURCE-PRESENT |
| `cloudflare-workers-urls.json` proxy chain/failover/Chinese-CDN relay | MICAFP configs | SOURCE-PRESENT |
| `dpi-signatures.json` standalone database | MICAFP configs | SOURCE-PRESENT |
| `isp-profiles.json` with `isp_detection` | MICAFP configs | SOURCE-PRESENT |
| `p2p-bootstrap-peers.json` multiaddr peers incl. `arvan_hosted_peers`, Yggdrasil, MQTT, I2P | MICAFP configs | SOURCE-PRESENT |
| `pluggable-transports.json` meek/snowflake/obfs4 selection | MICAFP configs | SOURCE-PRESENT |

## 2.8b Browser extensions

| Requirement line | Target home | Status |
|---|---|---|
| Chrome extension | `MICAFP/extensions/chrome` | SOURCE-PRESENT / not release-built |
| Firefox extension | `MICAFP/extensions/firefox` | SOURCE-PRESENT / not release-built |
| Shared TypeScript core files | `MICAFP/extensions/shared` | SOURCE-PRESENT |
| Rust `wasm-obfuscator` loaded in-browser | `MICAFP/wasm-obfuscator` / extension build | SOURCE-PRESENT; release build blocked without Rust/wasm toolchain |

## 2.8c AI model training pipeline

| Requirement line | Target home | Status |
|---|---|---|
| `dataset_collector.py` | `MICAFP/ai-models/train` | SOURCE-PRESENT |
| `adversarial_traffic_gan.py` | `MICAFP/ai-models/train` | SOURCE-PRESENT |
| `traffic_predictor_train.py`, `feature_engineering.py`, `dpi_classifier_train.py` | `MICAFP/ai-models/train` | SOURCE-PRESENT |
| `quantize_models.py`, `validate_onnx.py` | `MICAFP/ai-models/quantize` | SOURCE-PRESENT |

## 2.8d Dashboard schema and licensing

| Requirement line | Target home | Status |
|---|---|---|
| Extend existing Prisma `User`/`Session`/`AuditLog` schema, no parallel auth | `MICAFP/dashboard/prisma/schema.prisma` | MERGED/PARTIAL — License models exist in dashboard schema |
| Per-user independent license `expiresAt` | dashboard `License`, Android manager ledger | MERGED |
| License validation audit/device models | dashboard license service | MERGED |

## 2.9 Security / anti-forensics / PQ Lab

| Requirement line | Target home | Status |
|---|---|---|
| Ephemeral identity rotation/device secret management | Android security + MICAFP security | PARTIAL |
| Device-owner local trace cleanup | Android Emergency Privacy cleanup | MERGED M59 local-only |
| Clear license activation traces on panic | Android Emergency Privacy cleanup | PARTIAL/MERGED for local license/grace/device binding |
| PQ hybrid/PQC key store | MICAFP quantum/security modules | SOURCE-PRESENT |
| Experimental lattice/neural/QKD/noise/ratchet/ZKP/homomorphic modules behind feature flag | Experimental/Post-Quantum Lab | SOURCE-PRESENT / not fully surfaced |

## 3. Licensing / serial system

| Requirement line | Target home | Status |
|---|---|---|
| Honest impossibility: serverless + unforgeable + instant revoke cannot all hold | docs/license API, reports | IMPOSSIBLE-AS-STATED documented |
| Two Android apps: VPN client + License Manager | Android `app` and `license-admin` modules | MERGED/PARTIAL |
| License Manager offline Ed25519 signing | `OfflineLicenseManager.java` | MERGED M63 |
| Private key remains only in manager/operator app | Android Keystore encrypted seed | MERGED M63 |
| Per-license independent editable expiry | dashboard and offline ledger | MERGED |
| Revoke/delete specific license | dashboard whole/per-device + offline ledger revocation token | MERGED/PARTIAL |
| Local/offline ledger of issued licenses | License Manager `SharedPreferences` ledger | MERGED M63 |
| Encrypted ledger export/import | `v2rayez-license-ledger.enc` AES-GCM | MERGED M63 |
| VPN app local Ed25519 verification | `AndroidLicenseRepository.kt` | MERGED/PARTIAL |
| Optional device fingerprint/hash binding | Android client + License Manager deviceIdHash | MERGED M63 |
| Anti-clock rollback via monotonic/verified time | Android last server time/grace logic | PARTIAL; mesh/DNS-time sync remains |
| Serverless revocation list signed by same key | License Manager export + VPN local verification field | PARTIAL/MERGED M63; decentralized pull channels remain |
| Hard cutoff before tunnel start | Android VPN license enforcement/watchdog | MERGED/PARTIAL; shared Rust core enforcement remains |
| Countdown/expiry visible in UI | Android License status card | PARTIAL |
| App disguise mode | Android launcher alias target | SOURCE-PRESENT / not merged |
| Panic actions | Android Emergency Privacy cleanup | MERGED/PARTIAL |
| Logging opt-in by default | logging/privacy policy target | PARTIAL |
| Native/Rust verification instead of Kotlin/JS | shared Rust core target | SOURCE-PRESENT / not complete |
| Root/jailbreak/debugger/Frida/package checksum checks | security hardening target | SOURCE-PRESENT / not complete |

## 3a. Third-party attribution

| Component | Required notice | Status |
|---|---|---|
| Xray-core v26.7.28 MPL-2.0 | consolidated third-party notices | PARTIAL |
| Vazirmatn SIL OFL 1.1 | notices/design assets | PARTIAL |
| flag-icons/FlagCDN MIT | notices/assets | PARTIAL |
| `hev-socks5-tunnel` MIT | notices/Tor bridge | PARTIAL |

## 3b. Localization QA

| Requirement line | Target home | Status |
|---|---|---|
| EN/FA/RU key parity | `scripts/gates/string-key-parity.sh` | MERGED and run each Android UI milestone |
| Conflict/task CI gates preserved | `scripts/gates` | MERGED/PARTIAL |

## 4. Engineering process status

| Process requirement | Current status |
|---|---|
| Inventory pass before code | PARTIAL — `MERGE_INVENTORY.json`, `tools/merge_inventory.py`, and this requirement map now track source homes and gaps |
| No stubs / no silent omissions | Active rule; remaining items explicitly listed as SOURCE-PRESENT/PARTIAL/BLOCKED instead of called done |
| Build all five targets each milestone | BLOCKED-LOCAL in this sandbox due missing Java/JDK, Rust/cargo, Xcode, Windows, OpenWrt SDK, device labs/signing |
| Real E2E connectivity tests per transport family/platform | BLOCKED-LOCAL; no real device/router/server lab or signed artifacts available |
| Regression checklist after each step | Static gates run; native/runtime regressions require real toolchains/devices |
| Report after each milestone | `MILESTONE_*.md` and `TEST_EVIDENCE.md` |

## 5. Guardrails

| Guardrail | Status |
|---|---|
| No unauthorized access/exploitation functionality | Active rule; implemented features are scoped to user's own device/outbound traffic |
| No silent phone-home beyond scrubbed telemetry | Android telemetry uses PII scrubber; broader pipeline remains PARTIAL |
| Experimental/Post-Quantum Lab off by default | Required for future surfacing; source modules remain SOURCE-PRESENT |
