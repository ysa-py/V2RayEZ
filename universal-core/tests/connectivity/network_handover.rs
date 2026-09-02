//! Connectivity: Network handover (Wi-Fi → Cellular / interface switch).
//! Simulates reconnect via FFI start/stop; verifies graceful shutdown and fresh handle.

#[cfg(test)]
mod handover_tests {
    use crate::ffi::{v2rayez_core_init, v2rayez_core_start, v2rayez_core_stop, v2rayez_core_shutdown, v2rayez_free_string};
    use std::ffi::CString;

    /// HAND-01 / HAND-02: Sequence start → stop → start with new handle.
    /// Memory safety: each returned string freed; handle dropped only after stop.
    #[test]
    fn graceful_handover_sequence() {
        let h1 = v2rayez_core_init();
        assert!(!h1.is_null());

        let req = CString::new(r#"{"command":"Start","profile_id":"wifi"}"#).unwrap();
        let resp = v2rayez_core_start(h1, req.as_ptr());
        assert!(!resp.is_null());
        v2rayez_free_string(resp);

        // Simulate interface loss: graceful stop
        let stop_resp = v2rayez_core_stop(h1);
        assert!(!stop_resp.is_null());
        v2rayez_free_string(stop_resp);

        // Fresh handle for the cellular interface must be a *distinct*
        // allocation while the Wi-Fi handle is still live. This comparison is
        // only meaningful before h1 is freed: once h1 is deallocated the
        // allocator is free to hand the very same address back for h2, which
        // made the previous ordering (shutdown h1, then assert_ne!) a genuine
        // false-failure. Allocate first, compare, then release both.
        let h2 = v2rayez_core_init();
        assert!(!h2.is_null());
        assert_ne!(h1, h2, "concurrent sessions must not share one allocation");

        // Drop old session only after stop (graceful shutdown via Drop)
        v2rayez_core_shutdown(h1);

        let req2 = CString::new(r#"{"command":"Start","profile_id":"cellular"}"#).unwrap();
        let resp2 = v2rayez_core_start(h2, req2.as_ptr());
        assert!(!resp2.is_null());
        v2rayez_free_string(resp2);

        v2rayez_core_shutdown(h2);
    }

    /// HAND-03: Idempotent graceful shutdown during rapid reconnect.
    #[test]
    fn rapid_reconnect_idempotent_shutdown() {
        let h = v2rayez_core_init();
        assert!(!h.is_null());

        // Start and immediate stop
        let req = CString::new(r#"{"command":"Start"}"#).unwrap();
        let r = v2rayez_core_start(h, req.as_ptr());
        if !r.is_null() { v2rayez_free_string(r); }

        let s = v2rayez_core_stop(h);
        if !s.is_null() { v2rayez_free_string(s); }

        // Shutdown consumes handle; must not panic
        v2rayez_core_shutdown(h);
    }
}
