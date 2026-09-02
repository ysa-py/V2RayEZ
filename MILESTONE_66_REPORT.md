# Milestone 66 — Shared Rust Route Matrix Core Contract

## Scope
- Continue the V2RayEZ Universal merge by moving platform-neutral Route Matrix Test semantics into the shared Rust core.
- Keep Android as the first real probe implementation from Milestone 65 while preventing future iOS/desktop/Linux/OpenWrt/browser shells from inventing incompatible candidate/scoring rules.

## Changes
- `universal-core/src/route_matrix.rs`
  - Added shared route-matrix data model:
    - `RouteMatrixPhase` with qualification, stability, stress, final A/B/B/A, done, and error phases.
    - `RouteDnsPreset` for Cloudflare+AliDNS, Quad9+AliDNS, AdGuard+AliDNS, AliDNS-only, and guarded FakeDNS.
    - `RouteFragmentPreset` for Off, Fast 64–128B, Balanced 100–200B, and Stealth 256–512B.
    - `ROUTE_MATRIX_MTU_PRESETS = [1280, 1360, 1420, 1500]`.
    - `FINAL_ABBA_ORDER = [0, 1, 1, 0]`.
    - `RouteEdge`, `RouteMatrixCandidate`, `RouteProbeSample`, `RouteMatrixResult`, and `RouteMatrixSettingsOverride`.
  - Added deterministic candidate generation for bounded Edge × DNS × Fragment × MTU matrices.
  - Added shared score/confidence functions matching the Android M65 semantics: success rate, latency, jitter, throughput sample, confidence, and deterministic tie-breakers.
  - Added shared winner selection and A/B/B/A candidate expansion helpers.
  - Added unit tests for full bounded matrix generation, winner selection, and A/B/B/A final ordering.
- `universal-core/src/lib.rs`
  - Exported route matrix models and helpers from the crate public API.
- `docs/ANDROID_ROUTE_MATRIX_SPEED_TEST.md`
  - Documented the shared-core follow-up and platform split: Rust owns matrix semantics, Android owns current real probes.
- `docs/V2RAYEZ_UNIVERSAL_REQUIREMENT_MAP.md`
  - Updated the UAC Route Speed Test row to show M65 Android + M66 shared Rust contract progress.
- `tools/universal_route_matrix_core_gate.mjs`
  - New static gate for the shared Rust route-matrix API, scoring constants, candidate dimensions, A/B/B/A order, tests, exports, docs, and placeholder absence.

## Validation Passed
- `node tools/universal_route_matrix_core_gate.mjs`
- `node tools/android_route_matrix_speed_test_gate.mjs`
- `node tools/requirement_map_gate.mjs`
- `git diff --check`

## Blocked Real Build/Test
- `cargo test --manifest-path universal-core/Cargo.toml` cannot be run in this sandbox because `cargo`/`rustc` are unavailable.
- Non-Android platform bindings to `universal-core::route_matrix` remain to be implemented in later milestones.
- Real route-matrix connectivity validation still requires real devices/networks and deployed/configured endpoints.
