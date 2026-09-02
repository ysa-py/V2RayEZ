# Android Carrier Core Profiles

Milestone 64 adds UAC-Windows/MICAFP-style carrier-aware core preference selection to the Android V2RayEZ app while preserving the V2RayEZ UI.

## Preserved named core identities

The Android Core Manager now exposes the exact named MICAFP core inventory for traceability:

1. hiddify-core v4.1.0 — VLESS Reality, VMess, Trojan, Hysteria2, TUICv5, ShadowTLSv3, NaiveProxy — primary orchestration core
2. GFW-knocker/Xray-core v25.8.3-mahsa-r1 — VLESS Fragment, MVLESS, WireGuard Noise, FakeHost — Iran-specialized
3. sing-box v1.14.0-alpha.25 — Hysteria2, TUICv5, ShadowTLSv3, NaiveProxy — protocol management
4. AmneziaVPN (awg-go) 4.8.15.4 — AmneziaWG 1.5 with junk headers
5. DefyxVPN v5.2.8 — VLESS Reality, AmneziaWG 1.5 — high-speed P2P-assisted
6. MoaV v1.7.7 — MoaV Tunnel — adaptive, dynamic key rotation
7. Lantern v7.9.0 — Domain Fronting, Pluggable Transports
8. MahsaNG core v26.3.31-mahsa-r1 — MVLESS, WireGuard Noise, VLESS Fragment — Iran-tuned
9. Psiphon (GFW-knocker fork) — SSH+Obfs, CDN Fronting — last-resort serverless backup

## Carrier preference order

Auto mode applies the reviewed five-carrier rules without overwriting per-server explicit core choices:

- MCI / Hamrah-Aval → MahsaNG core + AmneziaVPN
- IranCell → hiddify-core + DefyxVPN
- Shatel → AmneziaVPN + Psiphon
- Asiatek → MahsaNG core + hiddify-core
- Rightel → DefyxVPN + hiddify-core

## Runtime behavior

- The detector uses Android `TelephonyManager` operator display/numeric values only.
- It does not request `READ_PHONE_STATE` and does not collect phone numbers, subscriber IDs, IMSI, ICCID, IMEI/MEID, SSID/BSSID, or local IP addresses.
- If a server has an explicit core override, V2RayEZ respects that override and does not auto-rewrite it.
- If Tor or domain fronting is enabled, V2RayEZ keeps the Xray wiring because those features are Xray-coupled in the current Android shell.
- If a selected process runtime is unavailable on the device, the existing fail-safe fallback logic still falls back to bundled Xray where supported.

## Remaining work

This milestone maps the named core identities and carrier preference rules into Android runtime selection. It does not prove the upstream native binaries for all nine named cores are available or connectivity-tested in this sandbox; real device/runtime tests remain blocked by the missing Android/JDK/native toolchain and by the lack of carrier-network test devices.

## Validation

- `node tools/android_carrier_core_profiles_gate.mjs`
- Existing Android identity, license, release, XML, and localization parity gates
