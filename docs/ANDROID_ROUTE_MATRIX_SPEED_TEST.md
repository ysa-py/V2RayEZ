# Android Route Matrix Speed Test

Milestone 65 adds a V2RayEZ-styled Android implementation of the UAC-Android Route Speed Test concept.

## What is tested

The matrix dimensions are:

- **Edge**: up to four currently configured compatible proxy endpoints, chosen in a mobile-safe order: favorites first, then lower known ping, then name.
- **DNS**: Cloudflare+AliDNS, Quad9+AliDNS, AdGuard+AliDNS, AliDNS-only, and guarded FakeDNS.
- **Fragment**: Off, Fast 64–128 bytes, Balanced 100–200 bytes, Stealth 256–512 bytes.
- **MTU**: 1280, 1360, 1420, 1500.

The tester exhaustively builds `Edge × DNS × Fragment × MTU` candidates for the selected edge set. The edge set is bounded so a phone does not run hundreds of long Xray probes on one tap; within that bound, the matrix is exhaustive.

## Staged competition

The implementation follows the UAC staged competition shape:

1. **Qualification** — one fast TCP reachability probe per candidate.
2. **Stability** — repeated latency probes, scored with jitter and success rate.
3. **Stress** — HTTP/site-fetch probes plus a Cloudflare speed endpoint sample to estimate throughput.
4. **Final A/B/B/A** — the top two candidates are tested in A/B/B/A order to reduce transient ordering bias.

## Scoring

The score combines:

- latency,
- jitter,
- throughput sample,
- success rate,
- confidence based on sample count and phase depth.

The winner can be applied directly, which updates the same V2RayEZ settings used by the real VPN connect/test path: `DnsConfig`, `FragmentConfig`, and app `mtu`.

## UI/UX

No donor UI is ported. The screen is a new V2RayEZ Compose screen under Tools, using existing V2RayEZ cards, typography, chips, colors, and back navigation.

## Shared-core follow-up

Milestone 66 moved the platform-neutral parts of this feature into `universal-core/src/route_matrix.rs`: candidate generation, DNS/fragment/MTU dimensions, A/B/B/A ordering, settings-override shape, score/confidence calculation, and winner selection. Android still performs the real local probes through `VpnController`; future desktop/iOS/Linux/OpenWrt/browser shells can bind to the same shared Rust contract instead of reimplementing matrix semantics.

## Limits still requiring real lab validation

This milestone adds real source-level route matrix probing and settings application. It is not a substitute for real device tests on Iranian carrier networks, nor does this sandbox prove the generated APK can run the probes because Java/JDK and Android device/tooling are unavailable here.

## Validation

- `node tools/android_route_matrix_speed_test_gate.mjs`
- Existing Android identity, adaptive routing, license, release, XML, and localization gates
