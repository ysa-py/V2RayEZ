//! V2RayEZ Universal shared core API.
//!
//! This crate is the Milestone-1 integration boundary for Android JNI, iOS
//! Network Extension/XCFramework, Windows/Tauri, Linux/systemd, and OpenWrt LuCI.
//! Donor transport engines are merged or wrapped behind this API; platform UI
//! layers must not reimplement transport, licensing, AI-provider, or config logic.

pub mod ai_provider;
pub mod config;
pub mod core_manager;
pub mod ffi;
pub mod ui_state;
pub mod license;
pub mod route_matrix;

// Connectivity test suites live under `tests/connectivity/` but are written as
// in-crate `#[cfg(test)] mod` blocks using `crate::...` paths. Cargo only
// auto-compiles top-level files in `tests/`, so without these `#[path]`
// declarations the suites were never built or executed. Including them here
// keeps the files exactly where they are while making them real, running tests.
#[cfg(test)]
#[path = "../tests/connectivity/mtu_fragmentation.rs"]
mod connectivity_mtu_fragmentation;

#[cfg(test)]
#[path = "../tests/connectivity/network_handover.rs"]
mod connectivity_network_handover;

#[cfg(test)]
#[path = "../tests/connectivity/packet_loss_jitter.rs"]
mod connectivity_packet_loss_jitter;

pub use ai_provider::{AIProviderConfig, AIProviderProbeResult, AIResponseShape};
pub use config::{ProxyProfile, ProxyProtocol};
pub use core_manager::{AddonManifest, AddonPackage, CoreSession, PlatformId};
pub use license::{LicenseDecision, LicenseVerifier, VerifiedLicense};
pub use route_matrix::{
    build_route_matrix, final_abba_candidates, route_matrix_score, select_winner, RouteDnsPreset,
    RouteEdge, RouteFragmentPreset, RouteMatrixCandidate, RouteMatrixPhase, RouteMatrixResult,
    RouteMatrixSettingsOverride, RouteProbeSample, FINAL_ABBA_ORDER, ROUTE_MATRIX_MTU_PRESETS,
};

pub use ffi::{v2rayez_core_init, v2rayez_core_shutdown, v2rayez_core_status, v2rayez_core_start,
    v2rayez_core_stop, v2rayez_license_verify, v2rayez_free_string};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TunnelCommand {
    Start { profile_id: String },
    Stop,
    Status,
    RouteSpeedTest { profile_id: String },
    SecurityAudit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CoreStartRequest {
    pub command: TunnelCommand,
    pub account_id: String,
    pub device_id: String,
    pub platform: PlatformId,
    pub signed_license_key: String,
    pub signed_grace_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CoreStartDecision {
    pub allowed: bool,
    pub reason: String,
    pub hard_cutoff_at: Option<String>,
}

impl CoreStartDecision {
    pub fn denied(reason: impl Into<String>) -> Self {
        Self { allowed: false, reason: reason.into(), hard_cutoff_at: None }
    }

    pub fn allowed_until(reason: impl Into<String>, cutoff: impl Into<String>) -> Self {
        Self { allowed: true, reason: reason.into(), hard_cutoff_at: Some(cutoff.into()) }
    }
}
