# Android National Intranet / Shutdown Diagnostics

Milestone 58 adds a V2RayEZ Android diagnostics section that classifies local connectivity into:

- `NORMAL` — at least one domestic probe and most international probes answer.
- `PARTIAL_RESTRICTION` — domestic connectivity exists but international reachability is degraded.
- `DOMESTIC_ONLY` — domestic probes answer while international probes fail; this matches national-intranet / international-shutdown symptoms.
- `OFFLINE` — neither domestic nor international probes answer.

## Why this exists

The user asked for the strongest possible behavior during international-internet outages and asked whether a no-server mode is possible. This diagnostic is deliberately precise:

- It detects shutdown symptoms locally on the Android device.
- It surfaces what still works: domestic network, VPN tunnel, Tor, SNI, add-on packs, and generated report rows.
- It does **not** claim that a phone can reach the global internet with no reachable peer, relay, server, or gateway.

## Operational behavior

When shutdown/intranet conditions are detected, the report tells the user/operator which fallback class is appropriate:

- partial restriction: use adaptive transports, fresh endpoints, Tor bridges, or mesh peers.
- domestic-only: local/domestic/P2P discovery may still work, but international egress requires a reachable peer/relay/gateway that itself has international access.
- full offline: no routing action can create connectivity until some network path returns.

## Privacy notes

- Probe results stay local to the app unless the user manually copies the diagnostics report.
- The probe class does not upload telemetry.
- This feature is not an anonymity guarantee; it is a precise reachability classifier and operator aid.

## Validation gates

- `node tools/android_national_intranet_gate.mjs`
- Android string XML parse for EN/FA/RU.
- Base string-key parity gate for EN/FA/RU.
