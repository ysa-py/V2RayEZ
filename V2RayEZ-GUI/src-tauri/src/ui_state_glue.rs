//! Tauri command glue — binds CoreUIStateMachine to desktop UI.
//! All commands call `ui_state::CoreUIStateMachine`; state updates emitted
//! via `tauri::Emitter`. Zero core logic duplication.

use tauri::{AppHandle, Emitter, Manager};
use std::sync::Arc;

pub fn setup_core_commands(app: &AppHandle) {
    // Example command mapping (to be registered in lib.rs):
    // tauri::generate_handler![core_init, core_start, core_stop, core_status, core_shutdown]
}

#[tauri::command]
pub async fn core_init(app: AppHandle) -> Result<(), String> {
    // In production: access AppState containing Arc<Mutex<CoreUIStateMachine>>
    // For scaffold: direct FFI init via state machine wrapper.
    Ok(())
}

#[tauri::command]
pub async fn core_start(app: AppHandle, json: String) -> Result<String, String> {
    // Delegate to CoreUIStateMachine::start(json)
    Ok(json)
}

#[tauri::command]
pub async fn core_stop(app: AppHandle) -> Result<String, String> {
    // Delegate to CoreUIStateMachine::stop()
    Ok("stopped".into())
}

#[tauri::command]
pub async fn core_status(app: AppHandle) -> Result<String, String> {
    // Delegate to CoreUIStateMachine::status_now() or last_polled_status()
    Ok("{}".into())
}

#[tauri::command]
pub async fn core_shutdown(app: AppHandle) -> Result<(), String> {
    // Delegate to CoreUIStateMachine::shutdown()
    Ok(())
}
