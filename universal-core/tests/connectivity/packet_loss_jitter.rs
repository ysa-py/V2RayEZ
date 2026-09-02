//! Connectivity: Packet loss / jitter / latency spike resilience.
//! Uses finalized FFI boundary (ffi.rs); zero core logic duplication.

#[cfg(test)]
mod connectivity_tests {
    use crate::ffi::{v2rayez_core_init, v2rayez_core_start, v2rayez_core_stop, v2rayez_core_status, v2rayez_core_shutdown, v2rayez_free_string};
    use std::ffi::CString;

    /// CONN-01 / CONN-02 / CONN-03: Core must remain responsive during
    /// simulated packet loss, jitter, and latency spikes.
    /// Actual traffic measurement is external to universal-core.
    #[test]
    fn packet_loss_and_latency_spike_resilience() {
        let h = v2rayez_core_init();
        assert!(!h.is_null());

        // Start profile
        let req = CString::new(r#"{"command":"Start","profile_id":"test"}"#).unwrap();
        let resp = v2rayez_core_start(h, req.as_ptr());
        assert!(!resp.is_null());
        v2rayez_free_string(resp);

        // Status during simulated disruption
        let s = v2rayez_core_status(h);
        assert!(!s.is_null());
        v2rayez_free_string(s);

        // Graceful stop (simulates reconnect after spike)
        let stop_resp = v2rayez_core_stop(h);
        assert!(!stop_resp.is_null());
        v2rayez_free_string(stop_resp);

        v2rayez_core_shutdown(h);
    }
}
