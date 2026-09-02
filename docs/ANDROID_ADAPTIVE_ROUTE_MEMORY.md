# Android Adaptive Route Memory

Milestone 61 adds a UAC-style adaptive route-memory layer to the Android V2RayEZ Home power button.

## What it does

- Maintains a local per-network-class score table for recently successful V2RayEZ routes.
- Promotes the current network class's champion and backup routes before the Home screen quick TCP scoring pass.
- Records successful connected sessions from `V2RayVpnService` with EWMA latency.
- Records failed connected/connecting sessions with a bounded cooldown so repeatedly failing routes stop winning future automatic connects.

## Network fingerprint privacy

The fingerprint is deliberately coarse and local-only:

- transport class: Wi-Fi / cellular / Ethernet / VPN / other,
- metered flag,
- not-roaming capability,
- OS validated-connectivity capability.

It intentionally does **not** store phone numbers, subscriber IDs, IMEI/MEID, BSSID/SSID, local IPs, destination hosts, serial/license keys, or subscription contents.

## Why this exists

The source inventory included UAC-Android adaptive connection behavior: remember winners, reuse them on future connects, keep backups, and cool down repeated failures. This milestone wires that behavior into the V2RayEZ Android Home connect flow while keeping the V2RayEZ UI unchanged.

## Validation

- `node tools/android_adaptive_route_memory_gate.mjs`
- Existing Android identity/license/release/static gates.
