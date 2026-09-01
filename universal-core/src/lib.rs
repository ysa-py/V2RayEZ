//! V2RayEZ Universal shared core API.
//!
//! This crate is the Milestone-1 integration boundary for Android JNI, iOS
//! Network Extension/XCFramework, Windows/Tauri, Linux/systemd, and OpenWrt LuCI.
//! Donor transport engines are merged or wrapped behind this API; platform UI
//! layers must not reimplement transport, licensing, AI-provider, or config logic.

pub mod ai_provider;
pub mod config;
pub mod core_manager;
pub mod license;

pub use ai_provider::{AIProviderConfig, AIProviderProbeResult, AIResponseShape};
pub use config::{ProxyProfile, ProxyProtocol};
pub use core_manager::{AddonManifest, AddonPackage, PlatformId};
pub use license::{LicenseDecision, LicenseVerifier, VerifiedLicense};

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
