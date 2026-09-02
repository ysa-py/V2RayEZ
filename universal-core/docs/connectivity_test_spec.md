# Real-World Connectivity Test Specification

**Scope:** Shared-core (`universal-core`) FFI boundary. Zero core logic duplication.

All scenarios exercise `v2rayez_core_start`, `v2rayez_core_stop`, `v2rayez_core_status`,
and `v2rayez_free_string`. Memory ownership is enforced at every step.

---

## 1. Packet Loss, Jitter, Latency Spikes

| Case ID | Condition | Measure | Core Action | Expected Behavior |
|---|---|---|---|---|
| CONN-01 | 5% random packet loss | Latency p99, TCP retransmit count | `start()` then `status()` during loss | Status reports active; no crash; graceful stop available |
| CONN-02 | Jitter ±200ms | RTT variance | `start()` → `stop()` after 30s | `stop()` returns success JSON; handle remains valid |
| CONN-03 | Latency spike >3s | Timeout detection | `start()` with profile, then `status()` at spike | Core returns allowed JSON; no hang (timeout handled externally) |

**Implementation:** `tests/connectivity/packet_loss_jitter.rs` defines stub measurements
using `CoreSession` / FFI. Actual traffic measurement requires external probe
(e.g., `ping`, `iperf3`) against the tunnel endpoint; core only verifies command
resilience.

---

## 2. MTU Fragmentation

| Case ID | Condition | MTU Setting | Core Reference |
|---|---|---|---|
| MTU-01 | Standard Ethernet | 1500 | `ROUTE_MATRIX_MTU_PRESETS[3]` |
| MTU-02 | PPPoE / DSL | 1420 | `ROUTE_MATRIX_MTU_PRESETS[2]` |
| MTU-03 | VPN overhead | 1360 | `ROUTE_MATRIX_MTU_PRESETS[1]` |
| MTU-04 | Low-bandwidth / mobile | 1280 | `ROUTE_MATRIX_MTU_PRESETS[0]` |

**Implementation:** `tests/connectivity/mtu_fragmentation.rs` verifies that
`RouteMatrixSettingsOverride` accepts each preset and that `build_route_matrix`
produces valid candidates without panic. No transport logic duplicated.

---

## 3. Network Handover (Wi-Fi → Cellular / interface switch)

| Case ID | Scenario | Sequence | Memory Safety Check |
|---|---|---|---|
| HAND-01 | Wi-Fi to Cellular | `start()` → traffic → `stop()` (Wi-Fi down) → `start()` (Cellular up, new profile) | `v2rayez_core_shutdown` on old handle only after `stop()`; new handle via `v2rayez_core_init` |
| HAND-02 | Rapid reconnect | `start()` → `stop()` → `start()` within 2s | Each string returned freed; no double-free |
| HAND-03 | Graceful shutdown during handover | `start()` → signal interface change → `v2rayez_core_shutdown` | `Drop` triggers `graceful_shutdown()`; `Arc<AtomicBool>` ensures idempotency |

**Implementation:** `tests/connectivity/network_handover.rs` simulates the
sequence using the FFI layer directly. It asserts that `v2rayez_core_stop`
returns valid JSON, that `v2rayez_core_shutdown` does not panic, and that
subsequent `v2rayez_core_init` produces a fresh non-null handle.

---

## 4. Integration with Release Profile (LTO / Strip)

All connectivity tests must compile and link against the `release` profile
(LTO + `strip = true`). The test binary itself is not stripped, but the
underlying `libv2rayez_universal_core.a` must be minimal for embedded
(OpenWrt / mobile) deployments.
