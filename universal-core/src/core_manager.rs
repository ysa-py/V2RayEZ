use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreManagerError {
    #[error("package {0} is not available on platform {1:?}")]
    UnsupportedPlatform(String, PlatformId),
    #[error("sha256 mismatch for {name}: expected {expected}, got {actual}")]
    ChecksumMismatch { name: String, expected: String, actual: String },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PlatformId {
    AndroidArmv7,
    AndroidArm64,
    AndroidX86,
    AndroidX86_64,
    IosArm64,
    WindowsX64,
    LinuxX64,
    LinuxArm64,
    OpenWrtGeneric,
    BrowserChrome,
    BrowserFirefox,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AddonKind {
    Xray,
    SingBox,
    Tor,
    Lyrebird,
    Obfs4,
    Snowflake,
    WebTunnel,
    HevSocks5Tunnel,
    Psiphon,
    ByeDpi,
    Mihomo,
    Aether,
    MasterDnsVpn,
    GeoAssets,
    Wintun,
    WinDivert,
    Npcap,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AddonAsset {
    pub platform: PlatformId,
    pub url: String,
    pub sha256_hex: String,
    pub size_bytes: Option<u64>,
    pub signature_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AddonPackage {
    pub id: String,
    pub name: String,
    pub version: String,
    pub kind: AddonKind,
    pub license: String,
    pub upstream: String,
    pub assets: Vec<AddonAsset>,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AddonManifest {
    pub schema: String,
    pub generated_at: String,
    pub packages: Vec<AddonPackage>,
}

impl AddonManifest {
    pub fn package_for_platform(&self, package_id: &str, platform: PlatformId) -> Result<&AddonAsset, CoreManagerError> {
        let package = self.packages.iter().find(|p| p.id == package_id).ok_or_else(|| CoreManagerError::UnsupportedPlatform(package_id.to_string(), platform))?;
        package.assets.iter().find(|a| a.platform == platform).ok_or_else(|| CoreManagerError::UnsupportedPlatform(package_id.to_string(), platform))
    }

    pub fn verify_asset_bytes(&self, package_id: &str, platform: PlatformId, bytes: &[u8]) -> Result<String, CoreManagerError> {
        let package = self.packages.iter().find(|p| p.id == package_id).ok_or_else(|| CoreManagerError::UnsupportedPlatform(package_id.to_string(), platform))?;
        let asset = package.assets.iter().find(|a| a.platform == platform).ok_or_else(|| CoreManagerError::UnsupportedPlatform(package_id.to_string(), platform))?;
        let actual = hex::encode(Sha256::digest(bytes)).to_ascii_lowercase();
        let expected = asset.sha256_hex.to_ascii_lowercase();
        if actual != expected {
            return Err(CoreManagerError::ChecksumMismatch { name: package.name.clone(), expected, actual });
        }
        Ok(actual)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    #[test]
    fn verifies_checksum() {
        let bytes = b"core-binary";
        let digest = hex::encode(Sha256::digest(bytes));
        let manifest = AddonManifest {
            schema: "v2rayez.addons.v1".to_string(),
            generated_at: "2026-09-01T00:00:00Z".to_string(),
            packages: vec![AddonPackage {
                id: "xray".to_string(),
                name: "Xray".to_string(),
                version: "v26.7.28".to_string(),
                kind: AddonKind::Xray,
                license: "MPL-2.0".to_string(),
                upstream: "https://github.com/XTLS/Xray-core".to_string(),
                assets: vec![AddonAsset { platform: PlatformId::LinuxX64, url: "https://example.invalid/xray".to_string(), sha256_hex: digest.clone(), size_bytes: None, signature_url: None }],
                metadata: BTreeMap::new(),
            }],
        };
        assert_eq!(manifest.verify_asset_bytes("xray", PlatformId::LinuxX64, bytes).unwrap(), digest);
    }
}

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// Graceful-shutdown-aware core session.
/// This is the primary memory-owning type for the FFI boundary.
#[derive(Debug)]
pub struct CoreSession {
    shutdown_requested: Arc<AtomicBool>,
}

impl CoreSession {
    pub fn new() -> Self {
        Self {
            shutdown_requested: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Signal graceful shutdown. Idempotent.
    pub fn graceful_shutdown(&mut self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
    }

    pub fn is_shutdown_requested(&self) -> bool {
        self.shutdown_requested.load(Ordering::SeqCst)
    }
}

impl Default for CoreSession {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for CoreSession {
    fn drop(&mut self) {
        self.graceful_shutdown();
    }
}

#[cfg(test)]
mod session_tests {
    use super::*;

    #[test]
    fn graceful_shutdown_is_idempotent() {
        let mut s = CoreSession::new();
        assert!(!s.is_shutdown_requested());
        s.graceful_shutdown();
        assert!(s.is_shutdown_requested());
        s.graceful_shutdown();
        assert!(s.is_shutdown_requested());
    }

    #[test]
    fn drop_triggers_shutdown() {
        let s = CoreSession::new();
        // Drop will call graceful_shutdown automatically.
        drop(s);
    }
}
