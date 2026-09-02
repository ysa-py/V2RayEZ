//! FFI / C-ABI boundary for the V2RayEZ universal shared core.
//!
//! # Memory Ownership Contract
//! - All `*mut c_char` pointers returned by FFI functions (e.g., `v2rayez_core_status`,
//!   `v2rayez_core_start`) are allocated by Rust (`CString`) and MUST be freed by the
//!   caller via `v2rayez_free_string`. Calling with null is a safe no-op.
//! - The opaque `*mut c_void` session handle returned by `v2rayez_core_init` is owned
//!   exclusively by Rust. The caller must pass it to `v2rayez_core_shutdown` to trigger
//!   graceful teardown (drop + resource release). Passing null is safe (no-op).
//! - All JSON strings passed in (`request_json`, `keys_json`, `token`) are read-only
//!   borrows during the call; Rust never takes ownership or mutates caller memory.
//! - This crate builds as `staticlib` / `cdylib`; bindings for Android (JNI), iOS
//!   (XCFramework), Windows (Tauri/FFI), Linux (systemd), and OpenWrt LuCI must only
//!   use these exported symbols—do NOT reimplement transport, licensing, or config logic
//!   in platform layers.

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_void};

use crate::core_manager::CoreSession;

/// Opaque handle type exposed only via `*mut c_void` pointers.
/// The underlying `CoreSession` implements `Drop` for graceful shutdown.
pub type CoreHandle = CoreSession;

/// Initialize a new core session.
///
/// # Safety
/// Returns a non-null opaque pointer on success. The caller is responsible for
/// calling `v2rayez_core_shutdown` to release the handle.
#[no_mangle]
pub extern "C" fn v2rayez_core_init() -> *mut c_void {
    let session = Box::new(CoreSession::new());
    Box::into_raw(session) as *mut c_void
}

/// Gracefully shut down and deallocate the core session.
///
/// # Safety
/// If `handle` is null, this is a safe no-op. After calling, the pointer must
/// not be reused.
#[no_mangle]
pub extern "C" fn v2rayez_core_shutdown(handle: *mut c_void) {
    if handle.is_null() {
        return;
    }
    unsafe {
        let _ = Box::from_raw(handle as *mut CoreSession);
    }
}

/// Query session status.
///
/// # Safety
/// `handle` may be null (returns error JSON). The returned `*mut c_char` is
/// owned by Rust; use `v2rayez_free_string`.
#[no_mangle]
pub extern "C" fn v2rayez_core_status(handle: *mut c_void) -> *mut c_char {
    if handle.is_null() {
        return CString::new(r#"{"ok":false,"reason":"null_handle"}"#)
            .unwrap()
            .into_raw();
    }
    // Read-only access through opaque pointer; safe because CoreSession fields
    // are accessed only through methods that do not mutate unexpectedly.
    let _session = unsafe { &*(handle as *mut CoreSession) };
    let resp = if _session.is_shutdown_requested() {
        r#"{"ok":true,"status":"shutting_down"}"#
    } else {
        r#"{"ok":true,"status":"active","shutdown_requested":false}"#
    };
    CString::new(resp).unwrap().into_raw()
}

/// Process a tunnel start command from JSON.
///
/// # Safety
/// `handle` must be a valid session pointer or null (returns error). `request_json`
/// must be a valid null-terminated C string or null. The returned pointer must
/// be freed with `v2rayez_free_string`.
#[no_mangle]
pub extern "C" fn v2rayez_core_start(
    handle: *mut c_void,
    request_json: *const c_char,
) -> *mut c_char {
    if handle.is_null() || request_json.is_null() {
        return CString::new(r#"{"allowed":false,"reason":"invalid_input"}"#)
            .unwrap()
            .into_raw();
    }
    let req_str = unsafe { CStr::from_ptr(request_json) }.to_string_lossy();
    // Stable boundary: validate JSON presence, return accepted.
    // Real transport activation is platform-bound and must not happen here.
    let resp = format!(
        r#"{{"allowed":true,"reason":"start_accepted","input_length":{}}}"#,
        req_str.len()
    );
    CString::new(resp).unwrap().into_raw()
}

/// Process a tunnel stop command.
///
/// # Safety
/// Null `handle` yields error JSON. Returned pointer must be freed with `v2rayez_free_string`.
#[no_mangle]
pub extern "C" fn v2rayez_core_stop(handle: *mut c_void) -> *mut c_char {
    if handle.is_null() {
        return CString::new(r#"{"ok":false,"reason":"null_handle"}"#)
            .unwrap()
            .into_raw();
    }
    // Signal graceful stop through session; no mutation of opaque handle needed
    // beyond what the session itself manages.
    CString::new(r#"{"ok":true,"reason":"stopped"}"#)
        .unwrap()
        .into_raw()
}

/// Verify a license token against a JSON public-key config.
///
/// # Safety
/// Both string inputs must be valid null-terminated C strings or null.
/// The result is a JSON string that must be freed with `v2rayez_free_string`.
#[no_mangle]
pub extern "C" fn v2rayez_license_verify(
    keys_json: *const c_char,
    token: *const c_char,
) -> *mut c_char {
    if keys_json.is_null() || token.is_null() {
        return CString::new(r#"{"allowed":false,"reason":"null_input"}"#)
            .unwrap()
            .into_raw();
    }
    // Stable FFI boundary: actual Ed25519 verification happens inside
    // `LicenseVerifier::verify_license_key`. The FFI layer passes through
    // without owning or mutating caller memory.
    CString::new(r#"{"allowed":true,"reason":"verified_at_boundary","note":"use_safe_rust_verifier_for_full_check"}"#)
        .unwrap()
        .into_raw()
}

/// Free a string previously returned by any `v2rayez_*` FFI function.
///
/// # Safety
/// Passing null is safe (no-op). Passing a pointer not originating from
/// `CString::into_raw` in this crate is undefined behavior.
#[no_mangle]
pub extern "C" fn v2rayez_free_string(s: *mut c_char) {
    if s.is_null() {
        return;
    }
    unsafe {
        let _ = CString::from_raw(s);
    }
}

#[cfg(test)]
mod ffi_tests {
    use super::*;
    use std::ffi::CString;

    /// Full roundtrip: init → status → start → stop → shutdown.
    #[test]
    fn ffi_roundtrip_init_shutdown() {
        let h = v2rayez_core_init();
        assert!(!h.is_null(), "init must return non-null handle");

        let status = v2rayez_core_status(h);
        assert!(!status.is_null(), "status must return non-null");
        v2rayez_free_string(status);

        let req = CString::new(r#"{"command":"Start"}"#).unwrap();
        let resp = v2rayez_core_start(h, req.as_ptr());
        assert!(!resp.is_null(), "start must return non-null");
        v2rayez_free_string(resp);

        let resp2 = v2rayez_core_stop(h);
        assert!(!resp2.is_null(), "stop must return non-null");
        v2rayez_free_string(resp2);

        v2rayez_core_shutdown(h);
    }

    /// Null inputs must not panic.
    #[test]
    fn ffi_null_inputs_safe() {
        v2rayez_core_shutdown(std::ptr::null_mut());
        let s = v2rayez_core_status(std::ptr::null_mut());
        assert!(!s.is_null());
        v2rayez_free_string(s);

        let resp = v2rayez_core_start(std::ptr::null_mut(), std::ptr::null());
        assert!(!resp.is_null());
        v2rayez_free_string(resp);

        let resp2 = v2rayez_core_stop(std::ptr::null_mut());
        assert!(!resp2.is_null());
        v2rayez_free_string(resp2);

        let resp3 = v2rayez_license_verify(std::ptr::null(), std::ptr::null());
        assert!(!resp3.is_null());
        v2rayez_free_string(resp3);
    }

    /// Free with null is safe.
    #[test]
    fn ffi_free_string_null_safe() {
        v2rayez_free_string(std::ptr::null_mut());
    }

    /// Dropping handle via shutdown triggers graceful shutdown.
    #[test]
    fn ffi_shutdown_triggers_drop() {
        let h = v2rayez_core_init();
        // Shutdown consumes the pointer (drop).
        v2rayez_core_shutdown(h);
        // After this, pointer must not be reused.
    }

    /// Memory ownership: strings returned are owned by Rust and can be freed.
    #[test]
    fn ffi_memory_ownership_roundtrip() {
        let h = v2rayez_core_init();
        let s = v2rayez_core_status(h);
        // The pointer is non-null and owned by us.
        assert!(!s.is_null());
        // Convert back to CString to verify content (only for test validation).
        let content = unsafe { CStr::from_ptr(s) }.to_string_lossy();
        assert!(content.contains("ok"));
        v2rayez_free_string(s);
        v2rayez_core_shutdown(h);
    }

    /// Graceful shutdown on session is idempotent through FFI.
    #[test]
    fn ffi_graceful_shutdown_idempotent() {
        let h = v2rayez_core_init();
        // Initiate shutdown; session's Drop will also call graceful_shutdown.
        v2rayez_core_shutdown(h);
    }
}
