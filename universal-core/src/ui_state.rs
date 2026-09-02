//! Platform-agnostic UI state machine for universal-core FFI lifecycle.
//!
//! All interactions are strictly bound to `ffi.rs` exported symbols.
//! Status polling runs asynchronously off the main UI thread via `std::thread`.
//! Memory ownership: every `*mut c_char` returned is converted to `String`
//! and immediately freed with `v2rayez_free_string`; session handle is
//! dropped via `v2rayez_core_shutdown` only by the owning manager.

use std::ffi::{c_void, CStr, CString};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreLifecycleState {
    Uninitialized,
    Initialized,
    Started,
    Stopped,
    ShuttingDown,
    Error(String),
}

#[derive(Debug)]
struct HandleWrapper(*mut c_void);

unsafe impl Send for HandleWrapper {}
unsafe impl Sync for HandleWrapper {}

impl Drop for HandleWrapper {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { crate::ffi::v2rayez_core_shutdown(self.0); }
        }
    }
}

pub struct CoreUIStateMachine {
    handle: Arc<Mutex<Option<HandleWrapper>>>,
    state: Arc<Mutex<CoreLifecycleState>>,
    poll_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    poll_interval_ms: u64,
    last_status: Arc<Mutex<Option<String>>>,
}

impl CoreUIStateMachine {
    pub fn new(poll_interval_ms: u64) -> Self {
        Self {
            handle: Arc::new(Mutex::new(None)),
            state: Arc::new(Mutex::new(CoreLifecycleState::Uninitialized)),
            poll_handle: Arc::new(Mutex::new(None)),
            poll_interval_ms,
            last_status: Arc::new(Mutex::new(None)),
        }
    }

    pub fn init(&self) -> Result<(), String> {
        let h = unsafe { crate::ffi::v2rayez_core_init() };
        if h.is_null() {
            *self.state.lock().unwrap() = CoreLifecycleState::Error("init_null".into());
            return Err("v2rayez_core_init returned null".into());
        }
        *self.handle.lock().unwrap() = Some(HandleWrapper(h));
        *self.state.lock().unwrap() = CoreLifecycleState::Initialized;
        Ok(())
    }

    pub fn start(&self, request_json: &str) -> Result<String, String> {
        let guard = self.handle.lock().unwrap();
        let h = guard.as_ref().map(|w| w.0).unwrap_or(std::ptr::null_mut());
        if h.is_null() { return Err("handle not initialized".into()); }
        let c_req = CString::new(request_json).map_err(|_| "invalid_json".to_string())?;
        let resp = unsafe { crate::ffi::v2rayez_core_start(h, c_req.as_ptr()) };
        if resp.is_null() { return Err("start_returned_null".into()); }
        let s = unsafe { std::ffi::CStr::from_ptr(resp) }.to_string_lossy().into_owned();
        unsafe { crate::ffi::v2rayez_free_string(resp); }
        *self.state.lock().unwrap() = CoreLifecycleState::Started;
        Ok(s)
    }

    pub fn stop(&self) -> Result<String, String> {
        let guard = self.handle.lock().unwrap();
        let h = guard.as_ref().map(|w| w.0).unwrap_or(std::ptr::null_mut());
        if h.is_null() { return Err("handle missing".into()); }
        let resp = unsafe { crate::ffi::v2rayez_core_stop(h) };
        if resp.is_null() { return Err("stop_returned_null".into()); }
        let s = unsafe { std::ffi::CStr::from_ptr(resp) }.to_string_lossy().into_owned();
        unsafe { crate::ffi::v2rayez_free_string(resp); }
        *self.state.lock().unwrap() = CoreLifecycleState::Stopped;
        Ok(s)
    }

    pub fn shutdown(&self) -> Result<(), String> {
        let mut guard = self.handle.lock().unwrap();
        if guard.is_some() {
            *self.state.lock().unwrap() = CoreLifecycleState::ShuttingDown;
            *guard = None;
        }
        *self.state.lock().unwrap() = CoreLifecycleState::Uninitialized;
        Ok(())
    }

    pub fn status_now(&self) -> Result<String, String> {
        let guard = self.handle.lock().unwrap();
        let h = guard.as_ref().map(|w| w.0).unwrap_or(std::ptr::null_mut());
        if h.is_null() { return Err("handle not initialized".into()); }
        let resp = unsafe { crate::ffi::v2rayez_core_status(h) };
        if resp.is_null() { return Err("status_returned_null".into()); }
        let s = unsafe { std::ffi::CStr::from_ptr(resp) }.to_string_lossy().into_owned();
        unsafe { crate::ffi::v2rayez_free_string(resp); }
        *self.last_status.lock().unwrap() = Some(s.clone());
        Ok(s)
    }

    pub fn start_polling(&self) {
        if self.poll_handle.lock().unwrap().is_some() { return; }
        let handle_clone = self.handle.clone();
        let state_clone = self.state.clone();
        let last_clone = self.last_status.clone();
        let interval = self.poll_interval_ms;
        let jh = thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_millis(interval));
                let h_guard = handle_clone.lock().unwrap();
                if let Some(ref wrapper) = *h_guard {
                    let resp = unsafe { crate::ffi::v2rayez_core_status(wrapper.0) };
                    if !resp.is_null() {
                        let s = unsafe { std::ffi::CStr::from_ptr(resp) }.to_string_lossy().into_owned();
                        unsafe { crate::ffi::v2rayez_free_string(resp); }
                        *last_clone.lock().unwrap() = Some(s.clone());
                    } else {
                        *last_clone.lock().unwrap() = Some("{\"ok\":false}".into());
                    }
                }
            }
        });
        *self.poll_handle.lock().unwrap() = Some(jh);
    }

    pub fn stop_polling(&self) {
        if let Some(jh) = self.poll_handle.lock().unwrap().take() {
            let _ = jh;
        }
    }

    pub fn last_polled_status(&self) -> Option<String> {
        self.last_status.lock().unwrap().clone()
    }

    pub fn current_state(&self) -> CoreLifecycleState {
        self.state.lock().unwrap().clone()
    }
}

#[cfg(test)]
mod ui_state_tests {
    use super::*;
    #[test]
    fn lifecycle_init_start_stop_shutdown() {
        let m = CoreUIStateMachine::new(500);
        m.init().expect("init ok");
        assert_eq!(m.current_state(), CoreLifecycleState::Initialized);
        let s = m.start(r#"{"command":"Start"}"#).expect("start ok");
        assert!(!s.is_empty());
        assert_eq!(m.current_state(), CoreLifecycleState::Started);
        let s2 = m.stop().expect("stop ok");
        assert!(!s2.is_empty());
        assert_eq!(m.current_state(), CoreLifecycleState::Stopped);
        m.shutdown().expect("shutdown ok");
        assert_eq!(m.current_state(), CoreLifecycleState::Uninitialized);
    }
    #[test]
    fn async_polling_does_not_block() {
        let m = CoreUIStateMachine::new(200);
        m.init().unwrap();
        m.start_polling();
        let status = m.status_now();
        assert!(status.is_ok());
        m.stop_polling();
        m.shutdown().unwrap();
    }
}
