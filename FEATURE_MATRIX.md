# V2RayEZ Universal — Feature Matrix

**Milestone:** 0 — inventory baseline  
**Date:** 2026-09-01  
**Rule:** This matrix tracks the full requested union. `Source preserved` means the donor code exists and is mapped; it does **not** mean final V2RayEZ Universal implementation is complete.

Legend:

- Build/E2E: `pending`, `pass`, `fail`, `blocked`.
- Implementation: `source preserved`, `mapped`, `in progress`, `merged`, `blocked`.

---

## 1) Platform artifacts

| Feature / artifact | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| Android universal APK | V2RayEZ, V2RayEZ-GUI Aether adapter, MICAFP, MSN-GUARD, UAC Android | `apps/android` | Android ABIs armeabi-v7a, arm64-v8a, x86_64; keep x86 if present | mapped | blocked: Java/Android SDK not available locally | pending | localization gate pass |
| iOS IPA | MICAFP | `apps/ios` | iOS Packet Tunnel | mapped | blocked: Xcode/signing unavailable in Linux sandbox | pending | pending |
| Windows installer `.exe` | V2RayEZ-GUI Aether adapter, EasySNI, UAC Windows, MICAFP | `apps/windows` | Windows x64 | mapped | blocked: Windows toolchain unavailable locally | pending | Python compile pass for UAC desktop modules |
| Windows portable | V2RayEZ-GUI Aether adapter, EasySNI, UAC Windows | `apps/windows/portable` | Windows x64 | mapped | blocked: Windows toolchain unavailable locally | pending | pending |
| Linux binary/package | MICAFP, EasySNI, MasterDnsVPN | `packages/linux` | Linux | mapped | blocked: Rust/Go unavailable | pending | pending |
| OpenWrt generic `.ipk` + LuCI | MICAFP, MasterDnsVPN | `packages/openwrt` | OpenWrt generic | mapped | blocked: OpenWrt SDK/toolchains unavailable | pending | pending |
| Chrome extension | MICAFP | `extensions/chrome` | Chrome | source preserved | pending | pending | pending |
| Firefox extension | MICAFP | `extensions/firefox` | Firefox | source preserved | pending | pending | pending |

---

## 2) Networking protocols and transports

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| VLESS | V2RayEZ, MICAFP, UAC Android, UAC Windows | `universal-core/engines/xray`, config | All | source preserved | pending | pending TCP/TLS family | pending |
| VMess | V2RayEZ, MICAFP, UAC Android | same | All | source preserved | pending | pending TCP/TLS family | pending |
| Trojan | V2RayEZ, MICAFP, UAC Android | same | All | source preserved | pending | pending TCP/TLS family | pending |
| Shadowsocks | V2RayEZ, MasterDnsVPN TCP forward target | same | All | source preserved | pending | pending TCP/TLS family | pending |
| XTLS-Reality / REALITY | V2RayEZ, MICAFP, UAC Android | `universal-core/transports/reality` | All | source preserved | pending | pending | pending |
| Hysteria2 | MICAFP, named cores | `universal-core/transports/hysteria2` | All | source preserved | pending | pending QUIC family | pending |
| TUICv5 | MICAFP, named cores | `universal-core/transports/tuic_v5` | All | source preserved | pending | pending QUIC family | pending |
| NaïveProxy | MICAFP, named cores | `universal-core/transports/naive_proxy` | All | source preserved | pending | pending TCP/TLS family | pending |
| ShadowTLS / ShadowTLSv3 | MICAFP, named cores | `universal-core/transports/shadow_tls` | All | source preserved | pending | pending TCP/TLS family | pending |
| Meek | MICAFP, MSN-GUARD Tor | `universal-core/transports/meek`, Tor bridge | All | source preserved | pending | pending Tor family | pending |
| DNS-over-HTTPS tunnel | MICAFP, EasySNI DoH | `universal-core/transports/doh_tunnel` | All | source preserved | pending | pending DNS family | pending |
| DNS-over-QUIC tunnel | MICAFP | `universal-core/transports/doq_tunnel` | All | source preserved | pending | pending DNS family | pending |
| MasterDnsVPN DNS request/response tunnel | MasterDnsVPN | `universal-core/transports/dns-tunnel` | All | source preserved | blocked: Go unavailable for local tests | pending DNS family | pending |
| ICMP tunnel and direct ping policy | MICAFP, UAC Windows | `universal-core/transports/icmp_tunnel`, platform ICMP policy | All | source preserved | pending | pending | pending |
| MQTT / MQTT-over-WebSocket tunnel | MICAFP | `universal-core/transports/mqtt*` | All | source preserved | pending | pending | pending |
| WebRTC relay | MICAFP extensions/dashboard | `universal-core/transports/webrtc`, extensions | Browser + All where possible | source preserved | pending | pending | pending |
| WebTransport | MICAFP | `universal-core/transports/webtransport`, extensions | All + Browser | source preserved | pending | pending QUIC family | pending |
| Domain Fronting | V2RayEZ, EasySNI, MICAFP, Lantern | `universal-core/fronting` | All | source preserved | pending | pending | pending |
| CDN tunnels generic/worker/Chinese CDNs | MICAFP, EasySNI | `universal-core/transports/cdn*`, workers | All | source preserved | pending | pending | pending |
| Multihop chaining | MICAFP | `universal-core/transports/multihop_chain` | All | source preserved | pending | pending | pending |
| Pluggable transports obfs4/Lyrebird/Snowflake/WebTunnel | V2RayEZ, MICAFP, UAC Android, MSN-GUARD | `universal-core/transports/pluggable_transport`, Tor | All | source preserved | pending | pending Tor/PT family | pending |
| WireGuard | MSN-GUARD, MICAFP | `universal-core/tunnel/wireguard` | All | source preserved | pending | pending WireGuard family | pending |
| AmneziaWG | MICAFP | `universal-core/tunnel/amneziawg` | All | source preserved | pending | pending WireGuard family | pending |
| MASQUE over HTTP/3 | V2RayEZ-GUI Aether adapter, MSN-GUARD, MICAFP | `universal-core/transports/masque` | All | source preserved | pending | pending QUIC family | pending |
| WARP-on-WARP | MSN-GUARD | `universal-core/transports/warp` | All | source preserved | pending | pending WireGuard family | pending |
| Psiphon | MSN-GUARD, EasySNI, MICAFP | `universal-core/transports/psiphon` | All | source preserved | pending | pending Tor/Psiphon family | pending |
| Tor and Tor-over-WARP | MSN-GUARD, V2RayEZ, UAC Android, EasySNI | `universal-core/transports/tor` | All | source preserved | pending | pending Tor family | pending |
| SOCKS5 local proxy mode | V2RayEZ, V2RayEZ-GUI Aether adapter, EasySNI, MasterDnsVPN, UAC Windows | `universal-core/local-proxy` | All | source preserved | pending | pending | pending |

---

## 3) Anti-DPI, obfuscation, fronting

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| uTLS Chrome-like fingerprinting | V2RayEZ-GUI Aether adapter, EasySNI, MICAFP | `universal-core/obfuscation/utls_fingerprint` | All | source preserved | pending | pending | pending |
| Random 64–1024 byte padding | MICAFP | `universal-core/obfuscation/packet_size_normalizer` | All | source preserved | pending | pending | pending |
| TCP fragmentation | EasySNI, MICAFP, UAC Android/Windows | `universal-core/obfuscation/tls_fragment/desync` | All | source preserved | pending | pending | pending |
| Fake/decoy packets | EasySNI, MICAFP | `universal-core/obfuscation/desync` | Windows/Linux/OpenWrt; Android where possible | source preserved | pending | pending | pending |
| Out-of-order segments | EasySNI/MICAFP | `universal-core/obfuscation/desync` | OS-gated | source preserved | pending | pending | pending |
| Iran-reachable CDN strategy | MICAFP configs/workers, EasySNI | `universal-core/fronting/cdn-selector` | All | source preserved | pending | pending | pending |
| Cloudflare Worker support with blocked-region flag | V2RayEZ, MICAFP, EasySNI | `workers/cloudflare`, `universal-core/fronting` | All | source preserved | pending | pending | pending |
| 9 MICAFP obfuscation engines | MICAFP `daemon/src/obfuscation` | `universal-core/obfuscation` | All | source preserved | pending | pending | pending |
| EasySNI MITM front proxy | EasySNI `internal/mitmdf` | `universal-core/fronting/mitm` | Android/Windows/Linux | source preserved | pending | pending | pending |
| DPI signature detection and bypass path | MICAFP `dpi-signatures`, scanner | `universal-core/dpi` | All | source preserved | pending | pending | pending |
| Security audit suite | MICAFP dashboard/API, MSN/V2RayEZ probes | `universal-core/security-audit`, dashboard | All | source preserved | pending | pending | pending |

---

## 4) AI/adaptive routing

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| DPI classifier | MICAFP | `universal-core/ai/dpi_classifier` | All | source preserved | pending | pending | pending |
| Adversarial traffic generator | MICAFP | `universal-core/ai/adversarial_traffic` | All | source preserved | pending | pending | pending |
| Feature extractor | MICAFP | `universal-core/ai/feature_extractor` | All | source preserved | pending | pending | pending |
| ONNX runtime | MICAFP | `universal-core/ai/onnx_runtime` | All | source preserved | pending | pending | pending |
| RL transport selector | MICAFP | `universal-core/ai/rl_transport_selector` | All | source preserved | pending | pending | pending |
| Traffic predictor | MICAFP | `universal-core/ai/traffic_predictor` | All | source preserved | pending | pending | pending |
| UCB bandit route selector | MICAFP | `universal-core/ai/ucb_bandit` | All | source preserved | pending | pending | pending |
| UAC adaptive connection | UAC Android, UAC Windows | `universal-core/adaptive-routing` | All | source preserved | pending | pending | pending |
| Route Speed Test matrix | UAC Android | `universal-core/scanner/route-speed-test` | Android + desktop | source preserved | pending | pending | pending |
| Per-carrier profiles incl. five Iranian carriers | MICAFP, UAC Windows | `universal-core/carrier-profiles` | All | mapped | pending | pending | pending |
| AI Provider Gateway | New + MICAFP local AI fallback | `universal-core/ai-provider`, app settings | All | in progress: dashboard/Rust primitives + Android Settings UI/client added | node self-test pass; Android build blocked locally | E2E active-tunnel probe pending | remaining platform UI wiring pending |
| GAN training pipeline | MICAFP `ai-models` | `ai-models` | Developer/CI | source preserved | Python available; tests pending | n/a | pending |

---

## 5) Mesh/P2P/national intranet

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| BLE mesh | MICAFP | `universal-core/mesh/ble`, platform bridges | Android/iOS | source preserved | pending | blocked local hardware | pending |
| Wi-Fi Aware/NAN | MICAFP | `universal-core/mesh/wifi-aware`, Android NanBridge | Android | source preserved | pending | blocked local hardware | pending |
| Gossip/topology/mesh crypto | MICAFP | `universal-core/mesh` | All where supported | source preserved | pending | pending lab | pending |
| libp2p Kademlia DHT | MICAFP | `universal-core/p2p/libp2p_discovery` | All | source preserved | pending | pending lab | pending |
| I2P/Yggdrasil overlays | MICAFP | `universal-core/p2p/overlays` | All | source preserved | pending | pending | pending |
| NAT traversal/hole punching | MICAFP | `universal-core/p2p/nat_traversal` | All | source preserved | pending | pending lab | pending |
| Source→Relay→Exit roles | MICAFP docs/modules | `universal-core/p2p/roles` | All | source preserved | pending | pending lab | pending |
| Incentive/reputation/trust scoring | MICAFP | `universal-core/p2p/reputation` | All | source preserved | pending | pending | pending |
| National Intranet Smart/Essential/Full | MICAFP | `universal-core/national-intranet` | All | source preserved | pending | pending simulated shutdown | pending |
| Domestic IP/domain allowlist | MICAFP configs/models | `universal-core/resources/iran` | All | source preserved | pending | pending | pending |
| SMS bootstrap | MICAFP Android + Rust | `universal-core/national-intranet/sms_bootstrap`, Android receiver | Android | source preserved | pending | blocked device/SMS | pending |
| Acoustic covert emergency channel | MICAFP | `universal-core/national-intranet/acoustic_covert` | Android/iOS/desktop with audio | source preserved | pending | pending lab | pending |
| NTP covert emergency channel | MICAFP | `universal-core/national-intranet/ntp_covert` | All | source preserved | pending | pending lab | pending |

---

## 6) Licensing and enforcement

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| `License` Prisma model related to `User` | MICAFP dashboard + new requirement | `dashboard/prisma/schema.prisma` | Server/Web | in progress: schema extended with License/DeviceActivation/LicenseValidation | Prisma validate pending | n/a | pending migration test |
| Issue/validate/revoke/renew APIs | New | `dashboard/src/app/api/licenses/*` | Server/Web | in progress: Next route handlers added | Next build pending | pending DB-backed integration | pending |
| Ed25519 signed license payload | New | `universal-core/license`, dashboard signer | All | in progress: JS signer/verifier + Rust verifier added | node crypto self-test pass; Rust compile blocked | pending | tamper rejection pass in self-test |
| Signed server timestamp/grace token | New | `universal-core/license/time` | All | in progress: server grace token + Rust offline decision model added | node self-test pass; Rust compile blocked | pending | clock rollback unit pending in Rust CI |
| Device+account binding | New | `universal-core/license/device`, dashboard DeviceActivation | All | in progress: salted device hash + activation model/service added | node self-test pass | pending DB-backed integration | pending |
| Hard cutoff after expiry | New | core start/stop gate | All | in progress: Rust decision model + Android V2RayVpnService gate/watchdog added | Rust/Android builds blocked locally | pending Android device tunnel expiry test; other platforms pending | pending kill-switch test |
| Renewal/activation UI | New | `apps/*` and LuCI | All | in progress: Android Settings → License activation screen added; other platform UIs pending | Android build blocked locally | pending real activation/expiry test | pending screenshot/navigation tests |

---

## 7) Observability/resilience/OTA/privacy

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| Watchdog debounce and reconnect | V2RayEZ, MICAFP, MSN/UAC | `universal-core/resilience/watchdog` | All | source preserved | pending | pending forced-failure | pending |
| Circuit breaker/retry/fallback | MICAFP | `universal-core/resilience` | All | source preserved | pending | pending | pending |
| SWRR/EWMA/session affinity | MICAFP, MasterDnsVPN | `universal-core/load_balancer` | All | source preserved | pending | pending | pending |
| Prometheus metrics/health/latency/alerts | MICAFP | `universal-core/monitoring`, dashboard | All | source preserved | pending | pending | pending |
| Differential privacy telemetry | V2RayEZ, MICAFP | `universal-core/telemetry` | All | source preserved | pending | n/a | pending scrubber tests |
| Battery adaptive duty cycle | MICAFP | `universal-core/battery` | Mobile + laptops | source preserved | pending | pending | pending |
| OTA GitHub/delta/SHA/mirrors | V2RayEZ-GUI Aether adapter, MICAFP, UAC Windows | `universal-core/ota`, dashboard | All | source preserved | pending | pending | pending signature tests |
| Third-party notices | V2RayEZ/UAC/Aether/EasySNI/MICAFP/MasterDnsVPN | root `THIRD_PARTY_NOTICES.md` | All | in progress | n/a | n/a | pending license audit |

---

## 8) Milestone 0 verification summary

| Check | Command | Result |
|---|---|---|
| Inventory generated | `python3 tools/merge_inventory.py` | pass; wrote `MERGE_INVENTORY.json` |
| V2RayEZ localization parity | `bash .../scripts/gates/string-key-parity.sh` | pass; EN/FA/RU all 967 keys |
| UAC Windows Python syntax | `python3 -m compileall -q uac_desktop` | pass |
| EasySNI Go tests | `go test ./...` | blocked; Go not installed |
| MasterDnsVPN Go tests | `go test ./...` | blocked; Go not installed |
| MICAFP/Aether Rust tests | `cargo --version` | blocked; Rust not installed |
| Android Gradle baseline | `java -version`, `./gradlew --version` | blocked; Java missing and wrapper not executable |
| iOS IPA | not run | blocked; Xcode/signing unavailable in Linux sandbox |
| Windows installer | not run | blocked; Windows toolchain unavailable in Linux sandbox |

---

## 9) Milestone 3 status delta

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| Desktop license activation/validation/clear | New + MICAFP dashboard + universal-core | V2RayEZ Tauri GUI commands/settings UI | Windows/Linux desktop | in progress: UI + Tauri commands + protected state + online/grace verifier added | Rust/Tauri build blocked; frontend tests pass | pending real license activation/expiry tunnel test | frontend static test PASS |
| Desktop hard cutoff watchdog | New | V2RayEZ Tauri GUI `connect()`/watchdog | Windows/Linux desktop | in progress: pre-start gate and connected-session watchdog added | Rust/Tauri build blocked | pending forced-expiry routing stop test | static command/wiring test PASS |
| Desktop no-code AI Provider Gateway | New + MICAFP AI gateway | V2RayEZ Settings → AI Engine + Tauri provider executor | Windows/Linux desktop | in progress: provider definition UI, secret alias store, request templates, response extraction, local fallback | Rust/Tauri build blocked; frontend tests pass | pending external API blocked/unreachable runtime test | frontend static test PASS |
| Android pre-foreground-service license preflight | New | `RealVpnController.connect/toggle` | Android | in progress: controller now validates before FGS start, service gate still fail-closes | Android build blocked by Java | pending device tunnel activation/expiry test | string parity/XML/diff checks PASS |

---

## 10) Milestone 4 status delta

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| OpenWrt LuCI license management | MICAFP + new license requirement | `/etc/config/unifiedshield`, LuCI CBI | OpenWrt | in progress: status/settings/validate-now action added | OpenWrt SDK blocked | pending router activation/expiry/revocation | shell syntax PASS for gate/init; Lua runtime blocked |
| OpenWrt fail-closed service gate | New + universal-core target | procd init + `license-gate.sh` | OpenWrt | in progress: start/reload blocked before daemon when license invalid/missing | OpenWrt SDK blocked | pending real tunnel no-leak test | `sh -n` PASS |
| OpenWrt no-code AI Gateway | New + MICAFP local AI | LuCI `ai_provider` table + `ai-provider-test.lua` | OpenWrt | in progress: provider definitions, aliases, test action, local fallback | OpenWrt SDK/Lua blocked | pending blocked API/router fallback test | Lua runtime blocked |

---

## 11) Milestone 5 status delta

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| iOS license activation/validation | New + MICAFP iOS | SwiftUI Settings + Keychain manager | iOS | in progress: activation/validate/clear UI + CryptoKit verifier + online/grace flow | Xcode/Swift blocked | pending real device activation/expiry/revocation | static brace check PASS |
| iOS packet-tunnel hard cutoff | New | `TunnelManager` + `PacketTunnelProvider` watchdogs | iOS | in progress: preflight before `startTunnel` and extension core startup; watchdog cancels invalid tunnel | Xcode/Swift blocked | pending Network Extension device test | static brace check PASS |
| iOS no-code AI Gateway | New + MICAFP local AI | SwiftUI AI Engine + provider gateway | iOS | in progress: provider definitions, Keychain aliases, templates, response extraction, local fallback | Xcode/Swift blocked | pending blocked API fallback test | static brace check PASS |

---

## 12) Milestone 6 status delta

| Feature | Source projects | Target component | Platforms | Implementation | Build test | E2E traffic test | Regression test |
|---|---|---|---|---|---|---|---|
| Dashboard license administration | New + MICAFP dashboard | Next.js admin panel + license APIs | Web/Dashboard | in progress: issue/validate/renew/revoke panel added | blocked: `eslint`/deps absent | pending DB-backed integration | MJS crypto self-test PASS after panel wiring; Next lint blocked |
| Dashboard AI provider configuration/test | New + MICAFP dashboard | Next.js AI Provider Gateway panel | Web/Dashboard | in progress: no-code provider test panel added | blocked: `eslint`/deps absent | pending external/local provider tests | MJS gateway self-test PASS after panel wiring; Next lint blocked |
