# Engineering Directive: V2RayEZ Universal — Full Feature Merge

You are acting as the lead engineer for **V2RayEZ Universal**, the single canonical
successor to six existing codebases. Your job is to merge every feature below into
V2RayEZ with **zero feature loss**, ship real, compilable, testable code (not
placeholders or TODOs), and verify each platform build actually connects and passes
traffic before calling anything "done." Do not silently drop, simplify, or "clean up"
away any capability listed here — if something is genuinely impossible to preserve,
stop and explicitly flag it instead of omitting it quietly.

## 0. Source projects being merged (do not lose any feature from any of these)
1. **V2RayEZ** (base app — Android, Kotlin/Compose, Xray core)
2. **V2RayEZ-GUI / Aether adapter donor** (Windows + Android behavior around the Aether/sing-box core, signed auto-update; not the shipped product identity)
3. **EasySNI** (Go, single-binary local web panel: SNI tunnel, domain fronting, scanners)
4. **MICAFP-UnifiedShield vip-ultra-Quantum-ultra** (Rust daemon + Flutter UI — the
   largest source: 22 transports, 9 obfuscation engines, 9 VPN cores, 7 AI/ML engines,
   10 post-quantum/experimental modules, mesh networking, national-intranet mode)
5. **MSN-GUARD** (native Android VpnService, Rust core, 5 transports, kill switch)
6. **UAC-SNI-Spoofer-Android** (Xray-based, adaptive per-network route racing/learning)
7. **UAC-SNI-Spoofer-Windows** (Xray + Patterniha SNI spoofing, per-carrier profiles,
   Mobile Gateway/LAN sharing)
8. **MasterDnsVPN** (Go, DNS-tunneling VPN/transport — see §2.1a; found on a second,
   more thorough automated pass and confirmed in-scope)

## 1. Target platforms and build artifacts (mandatory, all five)
| Platform | Artifact | Notes |
|---|---|---|
| Android | `.apk` (+ optional split ABIs, but a **universal APK is required**: armeabi-v7a, arm64-v8a, x86_64) | minSdk 26, native `VpnService`, Kotlin + Compose |
| iOS | `.ipa` | Network Extension / Packet Tunnel Provider, Swift |
| Windows | `.exe` (installer) + portable build | x64, system-wide TUN via sing-box/WinTun |
| Linux | native binary + package | systemd service option |
| OpenWrt / LuCI | `.ipk` | **must be the universal/generic OpenWrt target**, not device-specific; provide a LuCI web UI app, not just a CLI daemon |

Every platform must share one core engine (do not fork logic per platform). Use a
shared Rust core (from MICAFP) compiled to: JNI for Android, a Swift-callable static
lib/XCFramework for iOS, a native DLL/exe for Windows, a native binary for
Linux/OpenWrt. Platform layers (Kotlin, Swift, C++/Win32, LuCI Lua/JS) are thin
UI/lifecycle shells around this one core — never re-implement transport or crypto
logic per platform.

**Architectural note confirmed during source review**: the legacy Aether GUI donor and MSN-GUARD are
not two independent engines — MSN-GUARD's Rust core (`libaether.so` + JNI bridge
`libaether_jni.so`) *is* the `CluvexStudio/Aether` engine, the same engine wrapped by the V2RayEZ-GUI Aether adapter donor (Aether v1.7.0). Do not merge these as two separate cores;
merge Aether once and layer both feature sets (MSN-GUARD's 5-transport device-wide
tunnel behavior + the legacy Aether GUI donor's Scan Mode/routing/signed-update behavior) on that one
engine. MICAFP's Rust daemon is a distinct, separate core (its own 22-transport
stack) — that one genuinely does need a real merge with Aether, not just a rename.

## 2. Core networking feature set (merge all, keep all working simultaneously)

### 2.1 Protocols / transports (target: superset of all 22+ from MICAFP plus the rest)
VLESS, VMess, Trojan, Shadowsocks, XTLS-Reality, Hysteria2, TUICv5, NaïveProxy,
ShadowTLS, Meek, DNS-over-HTTPS tunnel, DNS-over-QUIC tunnel, ICMP tunnel, MQTT /
MQTT-over-WebSocket tunnel, WebRTC relay, WebTransport, Domain Fronting, CDN tunnel
(generic + Cloudflare Worker + Chinese-CDN variants: Alibaba/Tencent/Huawei/Baidu/
ByteDance), multihop chaining, pluggable transports (obfs4/Lyrebird), WireGuard,
AmneziaWG, MASQUE over HTTP/3, WARP-on-WARP, Psiphon, Tor (+ Tor-over-WARP), SOCKS5
local proxy mode. Preserve per-protocol field fidelity from UAC-Android: SNI, Host,
Path, ALPN, fingerprint, transport/security settings must round-trip exactly when
importing/exporting configs.

### 2.1a DNS-tunnel transport (from MasterDnsVPN — a distinct transport, add as its own mode)
Add DNS-request/response tunneling as a first-class transport option, for the case
where every other transport is blocked but port-53 DNS still reaches the internet:
- Low-overhead proprietary framing (~5–7 bytes/packet) plus an ARQ (retransmission)
  layer so the transport tolerates heavy packet loss
- True multipath: send simultaneously across several DNS resolvers, with selective
  packet duplication to guarantee delivery on unstable/censored networks
- 8 selectable internal load-balancing strategies across resolvers
- Resolver health checks: auto-disable a failing resolver and auto-re-enable it in
  the background once it recovers
- Automatic path-MTU discovery/sync to minimize fragmentation
- Selectable encryption: AES, ChaCha20, or a low-overhead XOR mode
- Optional compression: ZSTD, LZ4, or ZLIB
- Local DNS resolution + caching on the client (prevents DNS hijacking) with SOCKS5-
  based resolving support
- Optimized SOCKS5/SOCKS4 local proxy with reduced framing overhead
- TCP-forwarding mode so any other TCP protocol (including Shadowsocks and
  VLESS/VMess from this same app) can ride inside the DNS tunnel as a transport of
  last resort
- Full failover system between paths and adaptive routing based on measured
  latency/loss
- Server side needs its own delegated-subdomain DNS setup (A + NS records) — expose
  this as a guided setup flow in whatever admin/server tooling ships with the app,
  matching the automated Linux install script and Docker packaging from the source
  project

### 2.2 Obfuscation / anti-DPI stack
- XTLS-Reality (steal real TLS cert/session from a legitimate site; DPI probes see a
  real site, only clients with the correct auth reach the proxy)
- uTLS fingerprinting matched to real Chrome (NaïveProxy-style, zero TLS fingerprint
  delta from normal browsing)
- Protocol padding: randomized 64–1024 byte padding on all packets, applied
  automatically to every transport
- DPI-desync techniques: TCP fragmentation, fake/decoy packets, out-of-order segments
- Domain fronting restricted intelligently to CDNs actually reachable from Iran
  (Alibaba Cloud, Tencent Cloud) with Cloudflare excluded/flagged since it is blocked
  domestically — but keep Cloudflare Worker support for other regions/users
- 9 obfuscation engines from MICAFP `obfuscation/` — port all, do not drop any
- Client-side domain-fronting MITM proxy (from EasySNI): reads true Host header,
  reaches the CDN edge behind an allowed front SNI, with editable host→front rules,
  fronted DoH resolution, and live request/error logging

### 2.2a Named VPN core inventory (from MICAFP's own docs — preserve exact identities)
MICAFP's "9 VPN cores" are specific, versioned, named engines, not a generic count —
preserve each identity, protocol set, and role, and keep per-carrier preferences:

| # | Core | Protocols | Role |
|---|------|-----------|------|
| 1 | hiddify-core v4.1.0 | VLESS Reality, VMess, Trojan, Hysteria2, TUICv5, ShadowTLSv3, NaiveProxy | primary orchestration core |
| 2 | GFW-knocker/Xray-core v25.8.3-mahsa-r1 | VLESS Fragment, MVLESS, WireGuard Noise, FakeHost | Iran-specialized |
| 3 | sing-box v1.14.0-alpha.25 | Hysteria2, TUICv5, ShadowTLSv3, NaiveProxy | protocol management |
| 4 | AmneziaVPN (awg-go) 4.8.15.4 | AmneziaWG 1.5 with junk headers | |
| 5 | DefyxVPN v5.2.8 | VLESS Reality, AmneziaWG 1.5 | high-speed P2P-assisted |
| 6 | MoaV v1.7.7 | MoaV Tunnel | adaptive, dynamic key rotation |
| 7 | Lantern v7.9.0 | Domain Fronting, Pluggable Transports | |
| 8 | MahsaNG core v26.3.31-mahsa-r1 | MVLESS, WireGuard Noise, VLESS Fragment | Iran-tuned |
| 9 | Psiphon (GFW-knocker fork) | SSH+Obfs, CDN Fronting | last-resort serverless backup |

Carrier-specific core preference rules (5 Iranian carriers, not just 2 — extend the
UAC-Windows MCI/IranCell profile system to cover all five):
MCI/Hamrah-Aval → MahsaNG + AmneziaVPN · IranCell → hiddify-core + DefyxVPN ·
Shatel → AmneziaVPN + Psiphon · Asiatek → MahsaNG + hiddify-core · Rightel →
DefyxVPN + hiddify-core.

Additional dashboard/engine features to preserve exactly:
- **Shadow connections**: switch active core in under 2 seconds with no perceptible
  drop
- **Security audit suite**: DNS leak test, WebRTC leak detection, encryption-strength
  assessment, a privacy score
- **Precise DPI signature detection**, each with its own dedicated bypass path: TLS
  Reset, HTTP 403 response, Null Route, SNI filter, DNS poisoning
- **OTA updates**: GitHub Releases API + delta patching + SHA-256 verification, with
  Chinese CDN mirrors as an alternate download path for censored regions
- The existing **Next.js control-plane dashboard** (`dashboard/`, Next.js + React +
  shadcn/ui + Zustand + Prisma) exposes 12+ API routes: `ai-engine`,
  `auto-reconnect`, `cores`, `dpi-test`, `geo-router`, `health`, `kill-switch`,
  `network-analyzer`, `orchestrator`, `ota`, `security-audit`, `threat-intel`. This
  is a monitoring/control dashboard and is **distinct from the license-issuer admin
  panel** in §3 — keep them as two separate surfaces, do not conflate them.
- MICAFP's Flutter app also targets **macOS** in addition to Android/iOS/Windows/
  Linux. macOS was not in your required 5-platform list, so treat it as an optional
  bonus target — keep the code path if it merges cleanly, but do not block delivery
  of the 5 required platforms on it.

### 2.3 AI / adaptive routing layer (from MICAFP `ai/` — 7 engines, keep all)
- DPI traffic classifier (`dpi_classifier`)
- Adversarial traffic generator to evade classifier-based blocking (`adversarial_traffic`)
- Feature extractor for traffic shaping decisions
- ONNX runtime integration so models can be swapped/updated without recompiling the app
- Reinforcement-learning transport selector (`rl_transport_selector`)
- Traffic predictor
- UCB multi-armed-bandit route selector
- Also merge UAC-Android's **adaptive connection** system: build a network fingerprint
  from carrier/ASN/connection type, rank routes, learn from successful connections,
  reuse winners on future connects; per-profile "Champion" + "Backup" route caching;
  cooldown for repeatedly failing routes
- Merge UAC-Android's **Route Speed Test**: exhaustively test the
  Edge × DNS × Fragment × MTU matrix, multi-stage competition (qualification →
  stability → stress → final A/B/B/A), scoring on latency, jitter, throughput,
  success rate, and confidence
- Merge UAC-Windows per-carrier profiles (e.g., MCI/Hamrah Aval, IranCell) so tuning
  one carrier never overwrites another; add an "Auto" mode that detects carrier/ASN
  and picks the right profile automatically

### 2.4 AI provider gateway (new requirement — build from scratch)
Add a settings panel ("AI Engine") that lets the app call **external LLM/AI APIs**
(OpenAI, Anthropic, Google Gemini, etc.) for assistive features (e.g., diagnosing
connection failures, suggesting configs) **without any code changes when a new
provider or model is released** — implement this via:
- A provider-agnostic adapter interface (base URL, auth header, request/response
  schema template) configurable from a JSON file or in-app form, not hardcoded
- A "Test & Auto-detect" button that probes the configured endpoint and adapts to
  common response shapes (OpenAI-style vs Anthropic-style vs generic REST)
- Automatic fallback: if the configured external AI endpoint is unreachable or
  blocked (e.g., censored in Iran), fall back to the **on-device/local AI engine**
  (the MICAFP `ai/` stack above) so the anti-censorship features keep working with
  zero dependency on any single external API surviving
- Never require an external AI API key for core VPN/anti-DPI functionality — the
  external AI box is optional and additive, the internal engine is the load-bearing one

### 2.5 Mesh / offline / national-intranet resilience (from MICAFP)
- Mesh networking: Wi-Fi Aware (NAN) + BLE mesh + gossip protocol + topology manager,
  for device-to-device connectivity when there is no internet at all
- P2P: libp2p discovery with **Kademlia DHT** for serverless peer lookup, I2P
  overlay, Yggdrasil overlay, NAT traversal via libp2p hole-punching, peer exchange,
  relay selection. Three node roles: Source (in Iran) → Relay (any country) → Exit
  (free country, real internet access), with per-hop onion-style encryption layering,
  a relay-incentive system (people who relay get priority for their own traffic),
  and reputation/trust scoring for peers over time
- National Intranet Mode with three levels (Smart / Essential / Full), a maintained
  allowlist of Iranian domestic services (banking, government, telecom, education)
  that stay reachable during a shutdown, and automatic detection of shutdown/
  throttling conditions. The detection/fallback layer (from MICAFP
  `national_intranet/`) has 10 distinct modules — implement all of them individually,
  not as one generic "detect and fall back" blob:
  `nain_detector` + `intranet_detector` (shutdown/intranet-mode detection),
  `iran_ip_ranges` (domestic IP range database), `local_dns_resolver`,
  `fallback_routing`, `sms_bootstrap` (fetch fresh gateway info over SMS when data is
  cut), `ble_mesh` + `wifi_aware` (offline device mesh), and two covert channels that
  are easy to miss: **`acoustic_covert`** (data transport over an audio/sound
  channel) and **`ntp_covert`** (data transport hidden inside NTP protocol traffic)
- SMS-based bootstrap (from MICAFP Android: `SmsBootstrapReceiver`) to fetch fresh
  gateway/config info when data connectivity is fully cut

### 2.6 Device-wide tunneling and reliability (from MSN-GUARD + UAC)
- True `VpnService`/Network-Extension based device-wide TUN (not just a browser
  proxy) on every platform that supports it. Register the OS-level socket-protect
  callback (Android `VpnService.protect()`) on the core's own transport sockets so
  they are excluded from the TUN and do not create a routing loop — this bit MSN-
  GUARD gets right and it must be preserved exactly, it is easy to get wrong when
  porting to a new platform layer
- Tor integration should preserve MSN-GUARD's exact bridge-mode set, not just a
  generic "Tor" toggle: **Direct, Meek, obfs4, Snowflake**, plus Tor-over-WARP
  chaining for networks that block Tor itself
- Kill switch: full network cutoff if the tunnel drops, no plaintext leak
- DNS enforcement to public resolvers only (Cloudflare/Google/Quad9/AdGuard/OpenDNS
  with DoH + bootstrap addresses), carrier DNS excluded
- "Verified connect": only report success once real traffic has actually passed
  (not just handshake completion)
- Real UDP/QUIC bridging in userspace for video/voice/gaming
- Split tunneling / per-app routing with three modes: all apps, bypass selected, or
  tunnel only selected
- Exit-country picker for Tor/Psiphon-style modes with live relay/server counts
- Windows-specific: **Mobile Gateway** — auto-discover LAN devices and route their
  traffic through the active connection with zero manual proxy/static-IP config on
  the client device; show connected-device list and per-device status
- ICMP handling: since SOCKS/VLESS/Trojan don't carry ICMP, route `ping` via a direct
  rule over the physical interface so latency tools report real numbers while web/
  video traffic still goes through the tunnel

### 2.6a EasySNI internal modules (Go — preserve each as a distinct component)
`mitmdf` (MITM/domain-fronting), `logbus`, `server/web` (the web panel), `netutil`,
`sysproxy` (automatic system proxy configuration), `tun2socks`, `psiphon`, `ghdl`
(GitHub downloader for core binaries), `protocol`, `desync` (DPI-desync techniques),
`gtunnel` (Google/Fastly relay), `singbox`, `windivert`, `xray`, `winctl`, `splus`
(its own SPlus tunnel implementation), `proxy`, `tor`, and **`edgetunnel` +
`bpb`** — these two correspond to the well-known Iranian **BPB Panel** ecosystem for
deploying V2Ray/Xray configs on Cloudflare Workers; preserve compatibility with BPB's
config format, not just the generic worker deployment path — and `sni`.

### 2.6b UAC-SNI-Spoofer-Windows implementation basis (it is a Python app, not native
C++/C#)
Source modules confirm a Python desktop application: `engine.py`, `network.py`,
`gateway.py`, `models.py`, `storage.py`, `app_config.py`, `ui.py` (GUI layer),
`tls_tools.py`, `fragment_proxy.py`, `sni_maker.py` + `sni_maker_widgets.py` +
`sni_batch.py`, `verified_configs.py`, `update_checker.py`, `device_names.py`,
`icons.py`, `paths.py`, and a `pattern_core` package (the Patterniha SNI-spoofing
logic). Low-level packet capture uses **Npcap** (`npcap.py`). The wizard-character
guide is implemented as two separate files, `assistant.py` (logic/state machine) and
`assistant_messages.py` (copy) — keep this separation so the guide text stays easy
to localize independently of its behavior.

### 2.7 Config management (merge all import/export/scanning tooling)
- Import: share-link, QR code, raw text, clipboard, file, subscription URL, with
  non-destructive multi-subscription merging and automatic duplicate removal
- Config library: groups, tagging, bulk relay + speed test, right-click / multi-select
- Full structured VLESS/VMess/Trojan/Shadowsocks editor (not just raw JSON paste)
- Scanners: SNI scan, Mass SNI, Clean IP scanner, CDN edge test, CDN config builder,
  Mass URI tester, live-progress Site Scanner
- Cloudflare Worker generator and Google Apps Script + Cloudflare Worker domain-front
  relay generator, built entirely in-app (no external repo dependency)
- Core Manager: detect/download Xray, sing-box, Tor, pluggable-transport, Psiphon,
  DNS-tunnel addon packs with checksum (SHA-256) verification

### 2.8 App resilience / observability
- Watchdog with debounce (avoid flapping reconnect loops), one-shot auto-reconnect
- Circuit breaker, retry, and fallback chains for gateway selection
- Load balancing: weighted round robin + EWMA latency + session affinity
- Prometheus-style metrics, health checks, latency graphs, alerting
- Differential-privacy telemetry pipeline: crash/perf telemetry allowed, but PII
  (hosts, URIs, bridges, IPs, PEM certs, fingerprints, subscription bodies) must be
  scrubbed before any upload — this is a hard requirement, not optional
- Battery: adaptive duty cycling and power-aware behavior on mobile

### 2.8a Data-driven config assets (MICAFP `configs/*.json` — exact content, not just names)
- `cdn-endpoints.json`: covers Alibaba/Tencent/Baidu/Huawei CDN **and CloudFront and
  Fastly**, with a documented relay-selection strategy and failover policy
- `cloudflare-workers-urls.json`: proxy-chain config, failover config, and a
  Chinese-CDN-relay list
- `dpi-signatures.json`: a standalone DPI signature database (separate from the
  Rust-side detection logic — keep both in sync)
- `isp-profiles.json`: includes an `isp_detection` block in addition to per-ISP
  profiles
- `p2p-bootstrap-peers.json`: real libp2p multiaddr-format bootstrap peers with
  country, relay capacity, bandwidth, and 30-day uptime fields; includes
  **`arvan_hosted_peers`** (ArvanCloud — a major Iranian domestic CDN/host, worth
  calling out specifically since it's reachable from inside Iran even when foreign
  CDNs are not), `yggdrasil_seed_peers`, `mqtt_reachable_peers`, and
  `i2p_floodfill_routers`
- `pluggable-transports.json`: meek, snowflake, obfs4, with a transport-selection
  strategy

### 2.8b Browser extensions (Chrome + Firefox — full implementation, not a stub)
Both extensions (separate manifest/background/popup per browser) share one
TypeScript core in `extensions/shared/`: `webtransport_tunnel.ts`,
`isp-database.ts`, `iran-ip-ranges.ts`, `protocol.ts`, `dpi-signatures.ts`,
`crypto-utils.ts`. A separate Rust crate, `wasm-obfuscator`, compiles to WASM and is
loaded into the extensions so obfuscation runs in-browser too. Carry all of this
forward as part of the merged app's companion tooling.

### 2.8c AI model training pipeline (`ai-models/` — not just runtime inference)
This is a real Python training pipeline, not only an ONNX runtime consumer:
- `train/dataset_collector.py` — real traffic dataset collection
- **`train/adversarial_traffic_gan.py`** — a GAN that generates adversarial traffic
  for DPI evasion; the anti-DPI traffic shaping is GAN-trained, not a fixed
  heuristic, and this training code should be preserved and kept runnable
- `train/traffic_predictor_train.py`, `train/feature_engineering.py`,
  `train/dpi_classifier_train.py`
- `quantize/quantize_models.py` + `quantize/validate_onnx.py` — model compression
  for on-device inference and ONNX output validation

### 2.8d Existing dashboard database schema (directly informs the licensing design in §3)
The dashboard already ships a Prisma schema with `User` (role enum
ADMIN/OPERATOR/USER, bcrypt password), `Session` (token + IP + user agent +
expiry), `AuditLog`, `Core`, `Connection`, `CoreTest`, `P2PPeer`, and
`ThreatReport` models. **Build the licensing system as an extension of this existing
schema** — add a `License` model with a relation to `User` and its own independent
`expiresAt` per user — rather than standing up a separate, parallel user/auth system.
This keeps license management and user/session management in one consistent data
model instead of two.

### 2.9 Security / anti-forensics (from MICAFP `security/`)
- Ephemeral identity rotation, device secret management
- Anti-forensics: ability to wipe local connection traces/logs from the user's own
  device for their own protection (this is a defensive privacy feature for the
  device owner, not a tool for acting against other systems)
- Post-quantum crypto: hybrid handshake, PQC key store; treat the more speculative
  modules (lattice-onion routing, neural steganography, QKD simulation, quantum
  noise/obfuscator/ratchet, ZKP auth, homomorphic routing) as an optional
  "Experimental / Post-Quantum Lab" module behind a feature flag — implement them,
  but do not make the app's core connectivity depend on unproven cryptography

## 3. Licensing / serial-number system (new — build from scratch, none of the six
source projects had this)
Requirements, all mandatory:
- Each install activates with a serial/license key tied to a unique device+account ID
- **Per-user, independently configurable expiration date** — every user's expiry is
  stored and enforced separately server-side, not as a single global constant
- Anti-forgery: license keys are signed (e.g., Ed25519) by a license-issuing server;
  the client verifies the signature locally and cannot be tricked by a locally-edited
  key or clock rollback (use signed server timestamps with a short-lived grace token,
  not just the device clock)
- Online verification with a short offline grace period (e.g., 72 hours) so the app
  still works briefly without connectivity, then requires re-validation
- **Automatic, hard cutoff of VPN functionality the moment a license expires** — no
  partial degrade that a user could bypass; the tunnel refuses to start
- Admin/issuer dashboard (can reuse the existing `dashboard/` Next.js app scaffold
  found in MICAFP) to issue, revoke, extend, and audit licenses per user
- Renewal flow inside the app (in-app purchase / manual key entry) with clear expiry
  countdown UI
- Document the license server's REST API (issue, validate, revoke, renew endpoints)
  as part of deliverables

## 3a. Third-party attribution (must carry forward)
Preserve the bundled third-party components and their licenses found in the source
repos, with a consolidated `THIRD_PARTY_NOTICES` file in the merged app: Xray-core
v26.7.28 (MPL-2.0), Vazirmatn Persian UI font (SIL OFL 1.1), flag-icons/FlagCDN
country flags (MIT), and `hev-socks5-tunnel` (MIT, TUN-to-SOCKS bridge used by the
Tor engine). Do not drop attribution when re-bundling these.

## 3b. Localization QA gate (from the base V2RayEZ repo — keep this in CI)
The base app already has a `scripts/gates/` folder with `string-key-parity.sh`,
which checks that every translation key exists and matches across all supported UI
languages (English/Persian/Russian), plus `conflict-neighbors.txt` and
`task-exit.sh` for merge-conflict and CI gating. Keep running this gate in the
merged app's CI so that adding all these new features across a much larger UI
surface does not silently ship incomplete translations.

## 4. Non-negotiable engineering process
1. **Inventory pass**: before writing code, produce a line-by-line feature map from
   each of the six source repos to the unified codebase, and flag anything you cannot
   find a home for — do not delete silently.
2. **No stubs**: every feature listed above must have a real, working implementation.
   If a feature is too large for one pass, implement it fully in its own dedicated
   milestone rather than leaving a TODO in the merged main branch.
3. **Build all five targets** on each milestone (Android apk, iOS ipa, Windows exe,
   Linux binary, OpenWrt ipk) and confirm they compile.
4. **Real end-to-end connectivity tests** on each platform: actually establish a
   tunnel against at least one real server for each transport family (TCP/TLS-based,
   QUIC-based, WireGuard-based, Tor/Psiphon-based) and confirm traffic passes
   (HTTP 204 probe, DNS resolution, and a throughput sample) — not just "handshake
   succeeded." If a build fails to connect, debug the root cause (routing table,
   TUN permissions, DNS leak, blocked CDN, expired cert, etc.) and fix it before
   moving on; do not mark a milestone complete on an untested build.
5. **Regression checklist**: after each merge step, re-verify every previously
   working feature still works (protocol list, obfuscation list, AI routing, mesh,
   national-intranet mode, licensing) — this is a merge of six large codebases and
   silent breakage is the main risk.
6. Report back after each milestone with: what was merged, what was tested, what
   passed/failed, and what remains.

## 5. Explicit non-goals / guardrails
- Do not build functionality whose purpose is to attack, exploit, or gain
  unauthorized access to systems belonging to others. Every technique in this
  document (SNI spoofing, domain fronting, DPI evasion, mesh fallback) is applied to
  the user's own outbound traffic for their own censorship circumvention and privacy
  — not to intercept, impersonate, or compromise third-party systems or users.
- Do not silently phone home with anything beyond the explicitly scrubbed,
  differential-privacy telemetry described above.
- Keep the "Experimental / Post-Quantum Lab" modules clearly labeled as experimental
  and off by default.
# فهرست کامل قابلیت‌های هفت پروژه (قبل از ادغام در V2RayEZ)

من همه‌ی پوشه‌ها را دوباره به‌صورت خودکار و کامل بررسی کردم — این بار با چک کردن ساختار پوشه‌ها به‌جای فقط README ها، تا مطمئن شوم چیزی جا نیفتاده. در بازبینی خودکار، **یک پروژه هفتم به نام MasterDnsVPN را پیدا کردم که در فهرست اول من نبود** (چون README اصلی‌اش را اول بار نخوانده بودم). آن را کامل اضافه کردم؛ الان فهرست هر ۷ پروژه کامل و بررسی‌شده است.

---

## ۱) V2RayEZ (برنامه اصلی/پایه)
- کلاینت اندروید با Kotlin + Jetpack Compose + Hilt + Room + DataStore
- هسته Xray (`libv2ray.aar`) با VLESS، VMess، Trojan، Shadowsocks
- ایمپورت از لینک اشتراک، QR، فایل، متن
- پروکسی به‌ازای هر اپ (Per-app proxy)، روتینگ/DNS با پشتیبانی Geo Iran
- مرورگر داخلی + ابزار MITM / Domain Fronting
- پک‌های افزودنی: Tor، pluggable transports، ByeDPI از طریق Core Manager
- اعلان Foreground، کاشی Quick Settings، اتصال خودکار هنگام بوت
- سه زبان: انگلیسی، فارسی، روسی

## نکته معماری مهم (پیدا شده در بررسی دقیق‌تر): V2RayEZ-GUI Aether adapter و MSN-GUARD یک موتور مشترک دارند
هستهٔ Rust که MSN-GUARD به‌کار می‌برد (`libaether.so` + پل JNI `libaether_jni.so`) دقیقاً همان پروژهٔ **Aether از CluvexStudio** است که legacy Aether GUI donor هم روی آن ساخته شده (نسخهٔ هسته در آداپتر: v1.7.0). یعنی این دو پروژه از یک موتور VPN مشترک استفاده می‌کنند، فقط با دو پوستهٔ متفاوت (MSN-GUARD = پوستهٔ اندروید فقط-VPN با ۵ ترابری؛ آداپتر Aether = رفتار ویندوز/اندروید، مسیریابی و Scan Mode که پشت رابط V2RayEZ منتقل می‌شود). **در ادغام نهایی نباید این دو را به‌عنوان دو هستهٔ جدا پیاده‌سازی کرد** — باید یک بار هستهٔ Aether را ادغام کرد و هر دو مجموعه قابلیت (ترابری‌های MSN-GUARD + قابلیت‌های Scan Mode/مسیریابی/آپدیت امن آداپتر) را روی همان یک هسته سوار کرد.

نکات دقیق‌تر MSN-GUARD:
- حالت اجرا **فقط VPN** است (حالت پروکسی محلی به‌عمد حذف شده تا هدف تونل‌کردن کل دستگاه گم نشود) — پورت SOCKS داخلی ثابت `127.0.0.1:1819` فقط داخلی است
- مدیریت Tor شامل چهار حالت پل (bridge): **Direct، Meek، obfs4، Snowflake** به‌علاوهٔ زنجیرهٔ Tor-over-WARP — این ریزجزئیات باید عیناً حفظ شود، نه فقط «Tor» به‌صورت کلی
- `VpnService.protect()` روی سوکت‌های هسته ثبت می‌شود تا از حلقهٔ مسیریابی (routing loop) جلوگیری شود — این یک نکتهٔ فنی حیاتی برای پیاده‌سازی صحیح TUN روی اندروید است

## نکات دقیق‌تر دربارهٔ هستهٔ MICAFP (پیدا شده در بررسی عمیق‌تر پوشه‌ها و اسناد دشبورد)

### ۹ هسته VPN با نام و نسخهٔ دقیق (نه فقط «۹ هسته» به‌صورت کلی)
| # | هسته | پروتکل‌ها | نقش |
|---|------|----------|------|
| ۱ | hiddify-core v4.1.0 | VLESS Reality, VMess, Trojan, Hysteria2, TUICv5, ShadowTLSv3, NaiveProxy | هسته هماهنگ‌سازی اصلی |
| ۲ | GFW-knocker/Xray-core v25.8.3-mahsa-r1 | VLESS Fragment, MVLESS, WireGuard Noise, FakeHost | تخصصی عبور فیلترینگ ایران |
| ۳ | sing-box v1.14.0-alpha.25 | Hysteria2, TUICv5, ShadowTLSv3, NaiveProxy | مدیریت پروتکل‌ها |
| ۴ | AmneziaVPN (awg-go) 4.8.15.4 | AmneziaWG 1.5 با هدر جونک | |
| ۵ | DefyxVPN v5.2.8 | VLESS Reality, AmneziaWG 1.5 | عبور پرسرعت با P2P |
| ۶ | MoaV v1.7.7 | MoaV Tunnel | چرخش کلید پویا |
| ۷ | Lantern v7.9.0 | Domain Fronting, Pluggable Transports | |
| ۸ | MahsaNG core v26.3.31-mahsa-r1 | MVLESS, WireGuard Noise, VLESS Fragment | بهینه برای ایران |
| ۹ | Psiphon (فورک GFW-knocker) | SSH+Obfs, CDN Fronting | بکاپ آخرین مرحله |

### قوانین اختصاصی برحسب اپراتور ایران (نه فقط دو اپراتور UAC-Windows — این مجموعه ۵ اپراتور را پوشش می‌دهد)
همراه‌اول (مهساان‌جی + آمنزیاوی‌پی‌ان) · ایرانسل (هیدیفای + دیفیکس) · شاتل (آمنزیاوی‌پی‌ان + سایفون) · آسیاتک (مهساان‌جی + هیدیفای) · رایتل (دیفیکس + هیدیفای)

### قابلیت‌های بیشتر دشبورد/موتور که در فهرست اول به‌اندازه کافی دقیق نبود
- **اتصالات سایه (Shadow connections)**: تعویض فوری هسته در کمتر از ۲ ثانیه بدون قطعی محسوس
- **ممیزی امنیتی کامل**: تست نشت DNS، تشخیص نشت WebRTC، ارزیابی قدرت رمزنگاری، امتیازدهی حریم خصوصی
- **شناسایی امضای DPI ایران به‌صورت دقیق**: TLS Reset، پاسخ HTTP 403، Null Route، فیلتر SNI، مسمومیت DNS — هرکدام باید تشخیص و مسیر دورزدن اختصاصی خودش را داشته باشد
- **به‌روزرسانی OTA با patch دلتا**: از طریق GitHub Releases API + تأیید SHA256 (و برای کاربران چین/ایران، آینه‌های CDN چینی به‌عنوان مسیر جایگزین دانلود)
- Next.js Dashboard با ۱۲+ مسیر API مجزا: `ai-engine`، `auto-reconnect`، `cores`، `dpi-test`، `geo-router`، `health`، `kill-switch`، `network-analyzer`، `orchestrator`، `ota`، `security-audit`، `threat-intel` — این یک پنل کنترل/مانیتورینگ کامل جداست از هر پنل مدیریت لایسنس که تازه طراحی می‌شود؛ این دو نباید با هم قاطی شوند
- Flutter app علاوه بر اندروید/iOS/ویندوز/لینوکس، از **macOS** هم پشتیبانی می‌کند (یک پلتفرم اضافه که در درخواست اصلی شما نبود ولی چون در سورس هست، حذفش نکردیم — به‌عنوان یک هدف اختیاری/bonus نگه داشته می‌شود چون در فهرست ۵‌گانهٔ شما نیامده بود)

### کانال‌های مخفی/covert در حالت اینترانت ملی (این بخش قبلاً فقط به‌صورت خلاصه آمده بود — ماژول‌های دقیق این‌هاست)
`daemon/src/national_intranet/` شامل ۱۰ فایل مجزاست، نه فقط «تشخیص و فال‌بک»:
- `nain_detector.rs` + `intranet_detector.rs`: تشخیص فعال‌شدن اینترانت ملی/قطعی
- `iran_ip_ranges.rs`: پایگاه داده رنج آی‌پی‌های داخلی ایران
- `local_dns_resolver.rs`: ریزالور DNS محلی برای حالت قطعی
- `fallback_routing.rs`: مسیریابی جایگزین
- `sms_bootstrap.rs`: بوت‌استرپ از طریق پیامک
- `ble_mesh.rs` + `wifi_aware.rs`: مش آفلاین از طریق بلوتوث و Wi-Fi Aware
- **`acoustic_covert.rs`**: کانال مخفی مبتنی بر صدا (انتقال داده از طریق سیگنال صوتی) — این یکی در فهرست اول اصلاً نیامده بود
- **`ntp_covert.rs`**: کانال مخفی مبتنی بر پروتکل NTP — این هم در فهرست اول نیامده بود

### جزئیات دقیق‌تر شبکه P2P (از سند `P2P-SERVERLESS.md`)
- کشف همتا با **Kademlia DHT** (بدون سرور مرکزی)
- سه نوع گره: Source (ایران) → Relay (هر کشور) → Exit (کشور آزاد، دسترسی واقعی به اینترنت)
- رمزنگاری لایه‌به‌لایه شبیه Onion Routing (هر hop یک لایهٔ رمزنگاری اضافه می‌کند)
- NAT traversal با hole-punching در libp2p
- **سیستم انگیزشی**: کاربرانی که رله ارائه می‌دهند برای ترافیک خودشان اولویت می‌گیرند
- **امتیازدهی اعتماد (Trust scoring)**: همتاها با گذر زمان اعتبار کسب می‌کنند

### اجزای شخص‌ثالث بسته‌شده در UAC-SNI-Spoofer-Android (برای رعایت لایسنس‌ها هنگام ادغام)
Xray-core v26.7.28 (MPL-2.0)، فونت فارسی Vazirmatn (SIL OFL 1.1) برای رابط فارسی، پرچم کشورها از flag-icons/FlagCDN (MIT)، و `hev-socks5-tunnel` (MIT) برای پل TUN-به-SOCKS هستهٔ Tor — همهٔ این‌ها و مجوزهایشان باید در برنامهٔ نهایی هم به همراه فایل اعتبارات (Third-party notices) حفظ شوند.

### اجزای دقیق داخلی EasySNI (پوشه `internal/` — قبلاً فقط در سطح ویژگی گفته شده بود)
پوشهٔ Go شامل این ماژول‌هاست، هرکدام باید عیناً منتقل شود: `mitmdf` (MITM/دومین‌فرانتینگ)، `logbus`، `server/web` (پنل وب)، `netutil`، `sysproxy` (تنظیم خودکار پروکسی سیستم)، `tun2socks`، `psiphon`، `ghdl` (دانلودکنندهٔ گیت‌هاب برای هسته‌ها)، `protocol`، `desync` (تکنیک‌های DPI-desync)، `gtunnel` (تونل Google/Fastly)، `singbox`، `windivert`، `xray`، `winctl`، **`splus`** (تونل SPlus — قبلاً فقط اسم آمده بود، این پیاده‌سازی اختصاصی خودش را دارد)، `proxy`، `tor`، **`edgetunnel`** و **`bpb`** (این دو به پروژهٔ شناخته‌شدهٔ ایرانی BPB Panel/EDGE-tunnel برای دیپلوی روی Cloudflare Workers اشاره دارند — باید سازگاری با فرمت کانفیگ BPB هم حفظ شود)، `sni`.

### پایهٔ فنی دقیق UAC-SNI-Spoofer-Windows (قبلاً فقط «داشبورد ویندوز» گفته شده بود)
این برنامه در واقع یک اپ **پایتون** است (نه C#/C++ خالص): فایل‌هایی مثل `engine.py`، `network.py`، `gateway.py`، `models.py`، `storage.py`، `app_config.py`، `ui.py` (لایهٔ رابط گرافیکی)، `tls_tools.py`، `fragment_proxy.py`، `sni_maker.py` + `sni_maker_widgets.py` + `sni_batch.py`، `verified_configs.py`، `update_checker.py`، `device_names.py`، `icons.py`، `paths.py`، و پوشهٔ `pattern_core` (منطق اصلی Patterniha). ضبط بستهٔ سطح پایین با **Npcap** انجام می‌شود (`npcap.py`). شخصیت راهنمای Wizard هم دو فایل اختصاصی خودش را دارد: `assistant.py` و `assistant_messages.py` — یعنی منطق و متن‌های راهنما از هم جدا و قابل‌گسترش‌اند (مهم برای ترجمه/بومی‌سازی هنگام ادغام).

### ابزار QA زبان در V2RayEZ پایه (قبلاً دیده نشده بود)
پوشهٔ `scripts/gates/` شامل اسکریپت `string-key-parity.sh` است که بررسی می‌کند همهٔ کلیدهای رشته‌ای ترجمه (EN/FA/RU) در هر سه زبان کامل و هم‌تراز باشند، به‌همراه `conflict-neighbors.txt` و `task-exit.sh` برای کنترل کیفیت CI. این ابزار باید در فرایند build برنامهٔ یکپارچه هم نگه داشته شود تا اضافه‌کردن قابلیت‌های جدید باعث ترجمهٔ ناقص نشود.

## ۲) V2RayEZ-GUI / Aether adapter donor
- کلاینت ویندوز و اندروید مستقل روی هسته Aether + موتور مسیریابی sing-box
- روتینگ سیستمی (system-wide) یا SOCKS5 محلی
- Recovery خودکار برای آداپتور TUN باقی‌مانده و نشست‌های خراب
- Scan Mode + کنترل انتقال MASQUE روی HTTP/3 یا HTTP/2 با فینگرپرینت uTLS
- ترجمه کامل انگلیسی/فارسی با RTL
- بررسی خودکار آپدیت (هر ۱۲ ساعت)، دانلود خودکار، تأیید SHA-256 و تطبیق گواهی امضا (ضدجعل آپدیت)
- APK یونیورسال (ARMv7 + ARM64 + x86_64)، نصب‌کننده Windows (exe/msi/portable)
- (نکته فنی: نسخه ویندوز روی فریم‌ورک **Tauri** (Rust + وب‌ویو) ساخته شده، نه یک اپ Win32 خالص)

## ۳) EasySNI (پنل V2RayEz دسکتاپ – یک فایل باینری)
- **تونل SNI**: پروکسی TCP محلی که handshake TLS را با SNI جعلی انجام می‌دهد و به مقصد واقعی وصل می‌شود؛ همراه با DPI-desync (فرگمنتیشن، پکت جعلی، فینگرپرینت uTLS)
- هسته Xray و sing-box با دانلود/تشخیص خودکار؛ اجرا به‌صورت SOCKS5 یا TUN سراسری
- **Domain Fronting سمت کلاینت کامل**: پروکسی محلی MITM که Host واقعی را می‌خواند و از پشت SNI مجاز به CDN می‌رسد؛ قوانین Host→Front قابل‌ویرایش؛ DoH با پیش‌تنظیم Cloudflare/Google/Quad9
- کتابخانه کانفیگ: گروه‌بندی، اشتراک‌ها، لیست SNI/Spoof، ویرایشگر ساختاریافته کامل v2ray، اشتراک QR، تست سرعت گروهی
- اسکنرها: SNI Scan، Mass SNI، Clean IP Scanner، CDN Edge test، CDN Config builder، Mass URI tester، Site Scanner زنده
- **Google Tunnel (Fastly)**: رله دومین‌فرانتد از طریق Google Apps Script + Cloudflare Worker (تولید داخل برنامه)
- ابزارهای جانبی: سازنده Cloudflare Worker، مدیریت WinDivert، تونل‌های Psiphon و SPlus
- UI مدرن با تم روشن/تاریک، فارسی/انگلیسی، فلوئید کامل

### اجزای دقیق داخلی EasySNI (پوشه `internal/` — قبلاً فقط در سطح ویژگی گفته شده بود)
پوشهٔ Go شامل این ماژول‌هاست، هرکدام باید عیناً منتقل شود: `mitmdf` (MITM/دومین‌فرانتینگ)، `logbus`، `server/web` (پنل وب)، `netutil`، `sysproxy` (تنظیم خودکار پروکسی سیستم)، `tun2socks`، `psiphon`، `ghdl` (دانلودکنندهٔ گیت‌هاب برای هسته‌ها)، `protocol`، `desync` (تکنیک‌های DPI-desync)، `gtunnel` (تونل Google/Fastly)، `singbox`، `windivert`، `xray`، `winctl`، **`splus`** (تونل SPlus — پیاده‌سازی اختصاصی خودش را دارد)، `proxy`، `tor`، **`edgetunnel`** و **`bpb`** (به پروژهٔ شناخته‌شدهٔ ایرانی BPB Panel برای دیپلوی روی Cloudflare Workers اشاره دارند — سازگاری با فرمت کانفیگ BPB هم باید حفظ شود)، `sni`.

## ۴) MICAFP-UnifiedShield (vip-ultra-Quantum-ultra) — بزرگ‌ترین و پیشرفته‌ترین هسته
ادغام ۱۳ پروژه منبع در یک هسته Rust + Flutter. بخش‌های کلیدی:
- **۲۲ پروتکل انتقال (transport)**: از جمله VLESS، Reality، Hysteria2، TUICv5، NaïveProxy، ShadowTLS، Meek، DoH tunnel، DoQ tunnel، ICMP tunnel، MQTT/MQTT-WS tunnel، WebRTC relay، WebTransport، Domain Fronting، CDN tunnel (Cloudflare/Chinese CDN/CDN Worker)، Multihop chain، Pluggable transport
- **۹ موتور obfuscation** و **۹ هسته VPN**
- **۷ موتور هوش مصنوعی/یادگیری ماشین** (پوشه `ai/`): طبقه‌بند DPI (`dpi_classifier`)، ترافیک تخاصمی (`adversarial_traffic`)، استخراج ویژگی، اجرای مدل ONNX، انتخاب‌گر ترابری با یادگیری تقویتی (`rl_transport_selector`)، پیش‌بینی ترافیک، الگوریتم Bandit (UCB) برای انتخاب بهترین مسیر
- **۱۰ ماژول پسا-کوانتوم/تجربی**: هندشیک هیبریدی، لتیس-پیازی (onion)، استگانوگرافی عصبی، PQC key store، شبیه‌سازی QKD، نویز کوانتومی، obfuscator کوانتومی، ratchet کوانتومی، zkp auth، مسیریابی هومومورفیک
- **امنیت**: Anti-forensics، هویت یک‌بارمصرف (Ephemeral identity)، Device secret، Post-quantum crypto
- **P2P**: libp2p discovery، I2P overlay، Yggdrasil overlay، NAT traversal، Peer exchange، Relay selection
- **مش (Mesh)**: Gossip protocol، Mesh coordinator، Mesh crypto، Topology manager — یعنی شبکه مش روی Wi-Fi Aware (NAN) و BLE برای ارتباط آفلاین/بدون اینترنت
- **حالت اینترانت ملی (National Intranet Mode)**: تشخیص قطعی/فیلترینگ گسترده ایران، سه سطح (Smart / Essential / Full)، لیست کامل دامنه‌های داخلی ایران (بانک، دولت، آموزش، مخابرات) که در این حالت هنوز در دسترس می‌مانند، فال‌بک P2P برای پیام‌رسان‌های حیاتی
- Orchestrator مرکزی + Failover، Load balancer (SWRR+EWMA+session affinity)، Circuit breaker/retry/fallback chain
- Battery: چرخه کاری تطبیقی، مدیریت مصرف باتری
- Monitoring: Prometheus، health، latency، الرت
- Scanner: DPI scanner، Port scanner، DNS scanner
- Config: schema، پروفایل اپراتور، بروزرسانی از طریق IPFS
- IPC: یونیکس سوکت + Named pipe؛ Telemetry با حریم خصوصی افتراقی (differential privacy)؛ Watchdog سیستمی
- افزونه‌های مرورگر (Chrome/Firefox) + WASM obfuscator
- کد اندروید اضافی: `AntiForensicsReceiver`، `SmsBootstrapReceiver` (بوت‌استرپ از طریق پیامک وقتی اینترنت قطع است)، `NanBridge` (Wi-Fi Aware)، Battery Optimizer، Quick Settings Tile
- سند فنی «تکنیک‌های ضدDPI» شامل: XTLS-Reality (سرقت هویت TLS سایت واقعی)، QUIC (Hysteria2/TUICv5)، کاموفلاژ TLS شبیه Chrome (NaïveProxy)، Domain Fronting روی CDN‌های در دسترس ایران (Alibaba/Tencent — نه Cloudflare چون مسدود است)، Padding تصادفی پروتکل

### پیکربندی‌های داده‌محور MICAFP که در فهرست قبلی فقط اسم برده شده بود (اکنون محتوای دقیق)
- `configs/cdn-endpoints.json`: علاوه بر Alibaba/Tencent/Baidu/Huawei، شامل **CloudFront و Fastly** هم هست، با استراتژی انتخاب رله و فال‌بک
- `configs/cloudflare-workers-urls.json`: پیکربندی زنجیرهٔ پروکسی + فال‌بک + رله‌های CDN چینی
- `configs/dpi-signatures.json`: پایگاه‌دادهٔ مستقل امضاهای DPI (جدا از منطق تشخیص در کد Rust)
- `configs/isp-profiles.json`: شامل تشخیص خودکار ISP به‌علاوهٔ پروفایل هرکدام
- `configs/p2p-bootstrap-peers.json`: peer های بوت‌استرپ به فرمت واقعی `libp2p multiaddr` با فیلدهای کشور/ظرفیت رله/پهنای‌باند/uptime سی‌روزه؛ شامل **`arvan_hosted_peers`** (ArvanCloud — CDN داخلی ایران)، `yggdrasil_seed_peers`، `mqtt_reachable_peers`، `i2p_floodfill_routers`
- `configs/pluggable-transports.json`: meek، snowflake، obfs4 با استراتژی انتخاب ترابری

### افزونه‌های مرورگر Chrome/Firefox (جزئیات کامل، قبلاً فقط اشاره شده بود)
هر دو افزونه روی یک هستهٔ TypeScript مشترک در `extensions/shared/` ساخته شده‌اند: `webtransport_tunnel.ts`، `isp-database.ts`، `iran-ip-ranges.ts`، `protocol.ts`، `dpi-signatures.ts`، `crypto-utils.ts`. علاوه‌براین یک کریت جدای Rust به نام `wasm-obfuscator` به WASM کامپایل و داخل افزونه‌های مرورگر بارگذاری می‌شود.

### پایپ‌لاین آموزش مدل‌های هوش مصنوعی (`ai-models/`) — قبلاً فقط «اجرای مدل» گفته شده بود، ولی پایپ‌لاین آموزش کامل پایتون هم دارد
- `train/dataset_collector.py`: جمع‌آوری دیتاست ترافیک واقعی
- **`train/adversarial_traffic_gan.py`**: یک شبکهٔ GAN برای تولید ترافیک تخاصمی — یعنی «ترافیک ضدDPI» صرفاً هیوریستیک ثابت نیست، با GAN آموزش داده می‌شود
- `train/traffic_predictor_train.py`، `train/feature_engineering.py`، `train/dpi_classifier_train.py`
- `quantize/quantize_models.py` + `quantize/validate_onnx.py`: فشرده‌سازی برای اجرای on-device و اعتبارسنجی ONNX

### طرح دیتابیس دشبورد (Prisma) — مستقیماً به طراحی سیستم لایسنس مربوط است
دشبورد از قبل مدل‌های `User` (نقش ADMIN/OPERATOR/USER، پسورد bcrypt)، `Session` (توکن+IP+User-Agent+انقضا)، `AuditLog`، `Core`، `Connection`، `CoreTest`، `P2PPeer`، `ThreatReport` دارد. **پیشنهاد مهم**: به‌جای سیستم کاربر جداگانه برای لایسنس، یک مدل `License` جدید به همین اسکیمای Prisma موجود اضافه شود که به `User` مرتبط است (با `expiresAt` مستقل هرکاربر) تا لایسنس و مدیریت کاربر یکپارچه بماند.

## ۵) MSN-GUARD
- تونل کامل دستگاه (device-wide) با `VpnService` واقعی اندروید + TUN — نه فقط پروکسی مرورگر
- هسته شبکه Rust + لایه Kotlin برای UI/چرخه‌حیات
- **۵ مسیر ترابری مستقل**: MASQUE روی HTTP/3، WireGuard، WARP-on-WARP، Psiphon، Tor
- حالت Tor و Tor-over-WARP (وقتی خود Tor مسدود است)
- انتخاب کشور خروجی: ۲۷ کشور برای Tor، ۲۵ برای Psiphon با تعداد رله/سرور واقعی
- اتصال یک‌کلیکی با انتخاب و بازیابی خودکار گیت‌وی
- پشتیبانی واقعی UDP/QUIC (پل در userspace) برای ویدیو/بازی/تماس صوتی
- وضعیت زنده: IP خروجی + پرچم کشور، مصرف داده، مدت اتصال، لاگ زنده
- کاشی Quick Settings، Split tunneling (تونل تفکیکی)
- Kill switch واقعی (قطع کامل شبکه اگر تونل بیفتد)
- اجبار DNS به resolver عمومی (حذف کامل DNS اپراتور)
- «اتصال تأییدشده»: موفقیت فقط وقتی اعلام می‌شود که ترافیک واقعاً رد شده باشد
- تیونینگ اختصاصی برای اپراتورهای ایران (اندازه‌گیری واقعی روی شبکه، نه فرضی)

## ۶) UAC-SNI-Spoofer-Android
- تونل سراسری با `VpnService` + هسته Xray + مسیر بومی TUN
- پروفایل‌های VLESS/VMess/Trojan با حفظ کامل SNI/Host/Path/ALPN/Fingerprint
- **اتصال تطبیقی (Adaptive Connection)**: فینگرپرینت شبکه بر اساس اپراتور/ASN/نوع اتصال؛ یادگیری و اولویت‌بندی مسیر موفق قبلی
- استخرهای Edge اصلی/جایگزین به‌ازای هر اپراتور + مسیر Direct Compatibility (تست بدون جایگزینی آدرس)
- بازیابی خودکار هنگام تغییر شبکه با مسیر پشتیبان و cooldown برای مسیرهای ناموفق
- **Route Speed Test**: آزمایش کامل ترکیب Edge×DNS×Fragment×MTU با صدها مسیر مستقل
- رقابت چندمرحله‌ای مسیرها (غربال اولیه → پایداری → فشار → فینال A-B-B-A) با معیار latency/jitter/success-rate/confidence
- انتخاب و ذخیره Champion + Backup route به‌ازای کانفیگ/شبکه
- چند DNS Resolver مستقل با DoH (Cloudflare/Google/Quad9/AdGuard/OpenDNS)
- **Config Maker**: Quick Scan و Deep Adaptive Test
- ایمپورت از متن/کلیپ‌بورد/فایل/لینک اشتراک با ادغام غیرمخرب و حذف تکراری
- سه حالت روتینگ اپ‌ها (همه/بای‌پس انتخابی/فقط انتخابی)
- کنترل‌های Fragment، FinalMask، MTU، Mux، Keepalive، QUIC
- پایش زنده پینگ/ترافیک/کشور/IP خروجی + کاشی Quick Settings

## ۷) MasterDnsVPN (پروژه‌ای که در بررسی اول جا افتاده بود — اکنون اضافه شد)
یک VPN/تونل کامل روی درخواست و پاسخ DNS (شبیه DNSTT/SlipStream ولی با معماری اختصاصی)؛ به‌زبان Go با نسخه قدیمی‌تر Python:
- پروتکل اختصاصی سبک با سربار بسیار کم (~۵-۷ بایت در هر بسته) و مکانیزم ARQ (ارسال مجدد) برای پایداری در Packet Loss بالا
- **Multipath واقعی + Duplication**: ارسال هم‌زمان از چند resolver مختلف و تکثیر انتخابی بسته‌ها برای تضمین تحویل در شبکه‌های ناپایدار/سانسورشده
- **۸ نوع بالانسر داخلی** برای انتخاب بین رزولورها
- بررسی سلامت رزولورها، غیرفعال‌سازی خودکار رزولور خراب و فعال‌سازی مجدد در پس‌زمینه وقتی دوباره در دسترس شد
- کشف و همگام‌سازی خودکار MTU مسیر برای کاهش fragmentation
- رمزنگاری قابل‌انتخاب: AES، ChaCha20، یا XOR (برای حالت کم‌سربار)
- فشرده‌سازی اختیاری با سه الگوریتم: ZSTD، LZ4، ZLIB
- DNS محلی روی کلاینت با کشینگ حرفه‌ای (جلوگیری از DNS Hijacking) + امکان DNS resolving از طریق SOCKS5
- پشتیبانی و بهینه‌سازی SOCKS5/SOCKS4 با کاهش سربار
- حالت TCP Forwarding که می‌تواند هر پروتکل TCP دیگری از جمله Shadowsocks و VLESS/VMess را از داخل تونل DNS عبور دهد
- سیستم Failover کامل بین مسیرها
- Adaptive routing مبتنی بر latency/loss
- نصب سرور با اسکریپت خودکار روی لینوکس + Docker (Dockerfile، docker-compose، بیلد چندپلتفرمی)
- پیکربندی کامل با فایل‌های `server_config.toml` و `client_config.toml`
- ابزار benchmark داخلی برای سنجش کارایی

## ۸) UAC-SNI-Spoofer-Windows

### پایهٔ فنی دقیق (قبلاً فقط «داشبورد ویندوز» گفته شده بود)
این برنامه در واقع یک اپ **پایتون** است: `engine.py`، `network.py`، `gateway.py`، `models.py`، `storage.py`، `app_config.py`، `ui.py` (لایهٔ رابط گرافیکی)، `tls_tools.py`، `fragment_proxy.py`، `sni_maker.py` + `sni_maker_widgets.py` + `sni_batch.py`، `verified_configs.py`، `update_checker.py`، `device_names.py`، `icons.py`، `paths.py`، و پوشهٔ `pattern_core` (منطق اصلی Patterniha). ضبط بستهٔ سطح پایین با **Npcap** انجام می‌شود (`npcap.py`). شخصیت راهنمای Wizard دو فایل اختصاصی دارد: `assistant.py` و `assistant_messages.py` — منطق و متن‌های راهنما از هم جدا و قابل‌گسترش‌اند.
- داشبورد ویندوز روی Xray + متد SNI Spoofing گروه Patterniha
- **پروفایل جداگانه برای هر اپراتور** (همراه اول/MCI و ایرانسل) که مستقل از هم تنظیم و ذخیره می‌شوند + حالت Auto
- تونل محلی SOCKS/HTTP و حالت TUN سراسری اختیاری با sing-box برای TCP/UDP کل ویندوز
- **Mobile Gateway**: اشتراک‌گذاری خودکار اتصال با دستگاه‌های همان شبکه محلی، بدون نیاز به تنظیم دستی پروکسی/IP استاتیک؛ نمایش لیست دستگاه‌های متصل
- اسکن/رتبه‌بندی زنده SNI و Edge
- بهینه‌سازی شروع TLS مخصوص MCI + گرم‌سازی مسیر یوتیوب برای شروع سریع‌تر پخش
- پیشنهاد بهترین تنظیمات بر اساس تست واقعی صفحه + دانلود محدود
- App Bypass، لاگ زنده، بررسی IP عمومی
- تنظیمات پیشرفته Route/SNI/DNS/Timeout/Fallback
- بررسی نسخه از GitHub Releases
- بازگردانی امن پروکسی ویندوز بعد از قطع/خروج/ریستارت
- مدیریت هوشمند ICMP (ping از مسیر Direct چون SOCKS/VLESS/Trojan آن را حمل نمی‌کنند)
- **شخصیت راهنمای انیمیشنی (Wizard)**: یک کاراکتر با ۸ حالت احساسی مختلف (عادی، فکر کردن، منتظر، خوشحال، ناراحت، راهنمایی، گیج، متعجب) برای راهنمایی مرحله‌به‌مرحله کاربر هنگام تنظیم برنامه — این هم باید در UI برنامه یکپارچه حفظ شود

---

## نکته درباره چیزی که خواستید و در هیچ‌کدام از پروژه‌ها آماده نبود
**سیستم سریال‌نامبر/لایسنس با تاریخ انقضای جداگانه برای هر کاربر و ضدجعل** در هیچ‌یک از شش پروژه وجود نداشت — این یک قابلیت کاملاً جدید است که باید از صفر طراحی شود (سرور صدور لایسنس + امضای دیجیتال + بررسی آنلاین/آفلاین با grace period + قطع خودکار پس از انقضا). این را به‌طور کامل در پرامت مهندسی اضافه کرده‌ام.

همچنین «کادر افزودن API هوش مصنوعی جدید بدون تغییر کد + فیلتر خودکار API های فیلتر شده + هوش مصنوعی داخلی ضدفیلترینگ ایران» را به‌عنوان یک ماژول جدید (AI Gateway) طراحی کردم که روی هسته موجود MICAFP (`ai/`, `dpi_classifier`, `rl_transport_selector`) سوار می‌شود.

## ابزار QA زبان در V2RayEZ پایه (قبلاً دیده نشده بود)
پوشهٔ `scripts/gates/` در پروژهٔ پایهٔ V2RayEZ شامل اسکریپت `string-key-parity.sh` است که بررسی می‌کند همهٔ کلیدهای رشته‌ای ترجمه (EN/FA/RU) در هر سه زبان کامل و هم‌تراز باشند، به‌همراه `conflict-neighbors.txt` و `task-exit.sh` برای کنترل کیفیت CI. این ابزار باید در فرایند build برنامهٔ یکپارچه هم نگه داشته شود تا اضافه‌کردن قابلیت‌های جدید باعث ترجمهٔ ناقص نشود.

## نتیجه بررسی خودکار چهارم (خط‌به‌خط‌ترین سطح — محتوای واقعی کد/کانفیگ، نه فقط اسناد)
این بار به‌جای اسناد، مستقیماً داخل کد و فایل‌های پیکربینتری/کانفیگ رفتم: JSON های `configs/*` در MICAFP، اسکیمای واقعی دیتابیس Prisma، اسکریپت‌های آموزش مدل هوش مصنوعی (پایتون)، ساختار افزونه‌های مرورگر، و کد منبع پایتون UAC-Windows. یافته‌های تازه:
1. یک شبکهٔ **GAN** واقعی برای تولید ترافیک تخاصمی ضدDPI وجود دارد (نه فقط هیوریستیک ثابت) — پایپ‌لاین آموزش کامل پایتون هم باید حفظ شود.
2. دیتابیس دشبورد از قبل مدل کاربر/نشست/نقش دارد؛ سیستم لایسنس باید روی همین اسکیما بسازد نه جدا.
3. لیست بوت‌استرپ P2P شامل رله‌های میزبانی‌شده روی **ArvanCloud** (CDN داخلی ایران) است — این جزئیات ایران-محور مهم بود که نیامده بود.
4. UAC-Windows در واقع اپ **پایتون** با ضبط بستهٔ **Npcap** است، نه C++/C# خام.
5. EasySNI دو ماژول اختصاصی به نام‌های `bpb` و `edgetunnel` دارد که به فرمت کانفیگ پروژهٔ شناخته‌شدهٔ ایرانی BPB Panel اشاره می‌کنند.
6. یک ابزار QA خودکار برای هم‌ترازی کلیدهای ترجمه در خود V2RayEZ وجود دارد که باید در فرایند ساخت نسخهٔ یکپارچه هم اجرا شود.

فایل پرامت مهندسی (فایل دوم) با همهٔ این جزئیات به‌روزرسانی شد.

اگر جایی از این فهرست چیزی جا افتاده یا برداشت من اشتباه است، بگو تا اصلاح کنم. در غیر این صورت، پرامت مهندسی کامل انگلیسی آماده است.
 اگر هر چیزی  جا افتاده بود اضافه کن بهش بصورت کامل متوجه شدم بیشتر توضیح بدم بهت همه. تمامی قابلیت های ویژگی ها که دارم با دقت ذره بین بررسی کن ببین دقیق بعدش لیست کن یک پرامت مهندسی بنویس به خارجی بنویس که خطا نداشته باشه حتماً بصورت کامل متوجه شدی بیشتر توضیح بدم بهت که پیاده سازی کنه هوش مصنوعی Gemini  بصورت کامل متوجه شدم یا بیشتر توضیح بدم بهت هیچ چیزی قابلیتی از دست نره بصورت کامل متوجه شدم بیشتر توضیح بدم بهت 
ادادمه بده V2RayEZ-GUI
EasySNI- Make sure to fully add all features to the V2RayEZ app
MICAFP- Make sure to fully add all features to the V2RayEZ app
MSN-GUARD- Make sure to fully add all features to the V2RayEZ app
UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app
UAC-SNI-Spoofer-Windows- Make sure to fully add all features to the V2RayEZ app
V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)
همه تمامی قابیت ها رو ترکیب کن با این V2RayEZ- برنامه اصلی هست android  - ios - windows - linux - openwrt luci (باید نسخه یونیورسال باشه)
هچی و چیزی قابیتی حذف نکن و پاپ هم نشه یعنی میکم بهش قابیت پیشترفته هم اضافه کن بهش
V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version) android - ios - windows - linux - openwrt luci (باید نسخه یونیورسال باشه) فرمت های اپلیکیشن ها  android .apk - ios .ipa - windows .exe - openwrt luci .ipk
یک کادر اضافه کن بهش که API هوش مصنوعی هوش مصنوعی جدید ترین میاد باید ساپورت بشه بدون عوض کرده کدها  ساپورت بشه اضافه کنم اگر فیلترینگ فیلتر کن API ها  فایل بک هوش مصنوعی داخلی قوی ترین حرفه‌ای و صاحبوک ولی قوی ترین که ضد فیلترتنگ ایران باید باشه حتماً بصورت کامل خودکار هوشمند ترین باید باشه داینامیک باید باشه حتماً ضد DPI با هوش مصنوعی ایران باید باشه حتماً بصورت کامل متوجه شدی بیشتر توضیح بدم بهت قوی ترین حرفه‌ای جدید برای دور زدن فیلترینگ هوشمند ایران باید باشه حتماً و ضد DPI با هوش مصنوعی ایران باید باشه حتماً ووو غیره قابلیت های پیشرفته اضافه کن برای vpn لحالت سریال نامبر و لایسنسس داشته باشه و حالت سریال نامبر و لایسنس داشته باشه ضد جعل باید باشه حتماً بعداز تاریخ انقضا بصورت قطع بشه و برای هر کاربر بصورت کامل جداگانه تاریخ انقضا هم بصورت کامل و متغیر باید که برای هر کاربر بصورت کامل جداگاجه باید باشه شرفته اضافه کن
هست باید باشه حتماً بصورت آخر سره تست واقعی کن بصورت کامل متوجه شدی بیشتر توضیح بدم بهت  و قابلیت های پیشرفته اضافه کن با
دت ذره بین بررسی کن ببین دقیق  وصل هم نمیشه خطا ها رو رفع کن بصورت کامل خودکار باید باشه حتماً بصورت کامل هوشمند ترین کن با ببین دقیق بعدش بررسی کن ببین دقیق بعدش انجامش بده بصورت کامل خودکار باید باشه حتماً بصورت کامل متوجه شدی بیشتر توضیح بدم بهت انجامش بده بصورت کامل متوجه شدی بیشتر توضیح بدم بهت و  خودت هم  درستش کن   /android-dev /ios-dev /plan @general-purpose @Explore / [$android-dev](C:\\Users\\mehdi ll\\.zcode\\cli\\plugins\\cache\\zcode-plugins-official\\android-emulator\\0.1.0\\skills\\android-dev\\SKILL.md) [$ios-dev](C:\\Users\\mehdi ll\\.zcode\\cli\\plugins\\cache\\zcode-plugins-official\\ios-simulator\\0.1.0\\skills\\ios-dev\\SKILL.md) [$diagnosing-mcp](C:\\Users\\mehdi ll\\.zcode\\cli\\plugins\\cache\\zcode-plugins-official\\zcode-guide\\0.1.0\\skills\\diagnosing-mcp\\SKILL.md) [@android-emulator](plugin://android-emulator@zcode-plugins-official) [@ios-simulator](plugin://ios-simulator@zcode-plugins-official) [@browser-use](plugin://browser-use@zcode-plugins-official) [@computer-use](plugin://computer-use@zcode-plugins-official) [@zcode-guide](plugin://zcode-guide@zcode-plugins-official) [@document-skills](plugin://document-skills@zcode-plugins-official) [@skill-creator](plugin://skill-creator@zcode-plugins-official)
و
ادادمه بده V2RayEZ-GUI- همه تمامی قابیت ها رو در برنامه V2RayEZ اضافه کنی بصورت کامل
EasySNI- همه تمامی قابیت ها رو در برنامه V2RayEZ اضافه کنی بصورت کامل
MICAFP- همه تمامی قابیت ها رو در برنامه V2RayEZ اضافه کنی بصورت کامل
MSN-GUARD- همه تمامی قابیت ها رو در برنامه V2RayEZ اضافه کنی بصورت کامل
UAC-SNI-Spoofer-Android- همه تمامی قابیت ها رو در برنامه V2RayEZ اضافه کنی بصورت کامل
UAC-SNI-Spoofer-Windows- همه تمامی قابیت ها رو در برنامه V2RayEZ اضافه کنی بصورت کامل
همه تمامی قابیت ها رو ترکیب کن با این V2RayEZ- برنامه اصلی هست android  - ios - windows - linux - openwrt luci (باید نسخه یونیورسال باشه)
هچی و چیزی قابیتی حذف نکن و پاپ هم نشه یعنی میکم بهش قابیت پیشترفته هم اضافه کن بهش
V2RayEZ- برنامه اصلی هست  android - ios - windows - linux - openwrt luci (باید نسخه یونیورسال باشه) فرمت های اپلیکیشن ها  android .apk - ios .ipa - windows .exe - openwrt luci .ipk
یک کادر اضافه کن بهش که API هوش مصنوعی هوش مصنوعی جدید ترین میاد باید ساپورت بشه بدون عوض کرده کدها  ساپورت بشه اضافه کنم اگر فیلترینگ فیلتر کن API ها  فایل بک هوش مصنوعی داخلی قوی ترین حرفه‌ای و صاحبوک ولی قوی ترین که ضد فیلترتنگ ایران باید باشه حتماً بصورت کامل خودکار هوشمند ترین باید باشه داینامیک باید باشه حتماً ضد DPI با هوش مصنوعی ایران باید باشه حتماً بصورت کامل متوجه شدی بیشتر توضیح بدم بهت قوی ترین حرفه‌ای جدید برای دور زدن فیلترینگ هوشمند ایران باید باشه حتماً و ضد DPI با هوش مصنوعی ایران باید باشه حتماً ووو غیره قابلیت های پیشرفته اضافه کن برای vpn لحالت سریال نامبر و لایسنسس داشته باشه و حالت سریال نامبر و لایسنس داشته باشه ضد جعل باید باشه حتماً بعداز تاریخ انقضا بصورت قطع بشه و برای هر کاربر بصورت کامل جداگانه تاریخ انقضا هم بصورت کامل و متغیر باید که برای هر کاربر بصورت کامل جداگاجه باید باشه شرفته اضافه کن
هست باید باشه حتماً بصورت آخر سره تست واقعی کن بصورت کامل متوجه شدی بیشتر توضیح بدم بهت  و قابلیت های پیشرفته اضافه کن با
دت ذره بین بررسی کن ببین دقیق  وصل هم نمیشه خطا ها رو رفع کن بصورت کامل خودکار باید باشه حتماً بصورت کامل هوشمند ترین کن با ببین دقیق بعدش بررسی کن ببین دقیق بعدش انجامش بده بصورت کامل خودکار باید باشه حتماً بصورت کامل متوجه شدی بیشتر توضیح بدم بهت انجامش بده بصورت کامل متوجه شدی بیشتر توضیح بدم بهت و  خودت هم  درستش کن   /android-dev /ios-dev /plan @general-purpose @Explore / [$android-dev](C:\\Users\\mehdi ll\\.zcode\\cli\\plugins\\cache\\zcode-plugins-official\\android-emulator\\0.1.0\\skills\\android-dev\\SKILL.md) [$ios-dev](C:\\Users\\mehdi ll\\.zcode\\cli\\plugins\\cache\\zcode-plugins-official\\ios-simulator\\0.1.0\\skills\\ios-dev\\SKILL.md) [$diagnosing-mcp](C:\\Users\\mehdi ll\\.zcode\\cli\\plugins\\cache\\zcode-plugins-official\\zcode-guide\\0.1.0\\skills\\diagnosing-mcp\\SKILL.md) [@android-emulator](plugin://android-emulator@zcode-plugins-official) [@ios-simulator](plugin://ios-simulator@zcode-plugins-official) [@browser-use](plugin://browser-use@zcode-plugins-official) [@computer-use](plugin://computer-use@zcode-plugins-official) [@zcode-guide](plugin://zcode-guide@zcode-plugins-official) [@document-skills](plugin://document-skills@zcode-plugins-official) [@skill-creator](plugin://skill-creator@zcode-plugins-official)
