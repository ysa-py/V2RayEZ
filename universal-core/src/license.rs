use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LicenseError {
    #[error("signed token must have compact header.payload.signature format")]
    InvalidTokenFormat,
    #[error("token json cannot be parsed: {0}")]
    InvalidJson(String),
    #[error("token base64url cannot be decoded: {0}")]
    InvalidBase64(String),
    #[error("unsupported token algorithm: {0}")]
    UnsupportedAlgorithm(String),
    #[error("unexpected token type: expected {expected}, got {actual}")]
    UnexpectedType { expected: String, actual: String },
    #[error("unknown key id: {0}")]
    UnknownKeyId(String),
    #[error("invalid ed25519 public key for kid {0}")]
    InvalidPublicKey(String),
    #[error("bad signature")]
    BadSignature,
    #[error("missing required payload field: {0}")]
    MissingField(&'static str),
    #[error("invalid timestamp in field {field}: {value}")]
    InvalidTimestamp { field: &'static str, value: String },
    #[error("unsupported revocation list schema: {0}")]
    UnsupportedRevocationSchema(String),
    #[error("device hash salt must be at least 16 bytes")]
    InvalidDeviceSalt,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VerifiedLicense {
    pub license_id: String,
    pub user_id: String,
    pub account_id: String,
    pub status: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub max_devices: u32,
    pub offline_grace_hours: u32,
    pub features: Vec<String>,
    // Optional serial-level device binding. When present and non-empty it is
    // enforced offline without requiring a grace token.
    pub device_id_hash: Option<String>,
    // Monotonic revocation epoch embedded in the signed serial.
    pub revocation_epoch: u64,
    pub raw_payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevocationListEntry {
    #[serde(default)]
    pub license_id: String,
    #[serde(default)]
    pub revocation_epoch: u64,
    #[serde(default)]
    pub revoked_at: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignedRevocationList {
    #[serde(default)]
    pub schema: String,
    #[serde(default)]
    pub issued_at: Option<String>,
    #[serde(default)]
    pub revocations: Vec<RevocationListEntry>,
}

impl SignedRevocationList {
    pub fn revokes(&self, license_id: &str, revocation_epoch: u64) -> bool {
        self.schema == "v2rayez.license.revocations.v1"
            && self
                .revocations
                .iter()
                .any(|entry| entry.license_id == license_id && entry.revocation_epoch >= revocation_epoch)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VerifiedGraceToken {
    pub license_id: String,
    pub user_id: String,
    pub account_id: String,
    pub device_id_hash: String,
    pub platform: String,
    pub status: String,
    pub server_time: DateTime<Utc>,
    pub grace_until: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub raw_payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LicenseDecision {
    pub allowed: bool,
    pub reason: String,
    pub hard_cutoff_at: Option<DateTime<Utc>>,
    pub verified_license: Option<VerifiedLicense>,
    pub verified_grace: Option<VerifiedGraceToken>,
}

impl LicenseDecision {
    pub fn deny(reason: impl Into<String>) -> Self {
        Self { allowed: false, reason: reason.into(), hard_cutoff_at: None, verified_license: None, verified_grace: None }
    }

    pub fn allow(reason: impl Into<String>, cutoff: DateTime<Utc>, license: VerifiedLicense, grace: VerifiedGraceToken) -> Self {
        Self { allowed: true, reason: reason.into(), hard_cutoff_at: Some(cutoff), verified_license: Some(license), verified_grace: Some(grace) }
    }

    pub fn allow_offline(reason: impl Into<String>, cutoff: DateTime<Utc>, license: VerifiedLicense) -> Self {
        Self { allowed: true, reason: reason.into(), hard_cutoff_at: Some(cutoff), verified_license: Some(license), verified_grace: None }
    }
}

#[derive(Debug, Clone)]
pub struct LicenseVerifier {
    public_keys: BTreeMap<String, Vec<u8>>,
    device_hash_salt: String,
    max_clock_rollback_seconds: i64,
}

impl LicenseVerifier {
    pub fn new(public_keys: BTreeMap<String, Vec<u8>>, device_hash_salt: impl Into<String>) -> Result<Self, LicenseError> {
        let salt = device_hash_salt.into();
        if salt.len() < 16 {
            return Err(LicenseError::InvalidDeviceSalt);
        }
        Ok(Self { public_keys, device_hash_salt: salt, max_clock_rollback_seconds: 300 })
    }

    pub fn with_clock_rollback_window_seconds(mut self, seconds: i64) -> Self {
        self.max_clock_rollback_seconds = seconds.max(0);
        self
    }

    pub fn hash_license_key(&self, license_key: &str) -> String {
        sha256_base64url(format!("v2rayez-license-key\0{license_key}").as_bytes())
    }

    pub fn hash_device_id(&self, device_id: &str) -> String {
        sha256_base64url(format!("v2rayez-device\0{}\0{}", self.device_hash_salt, device_id.trim()).as_bytes())
    }

    pub fn verify_license_key(&self, token: &str) -> Result<VerifiedLicense, LicenseError> {
        let payload = self.verify_compact_token(token, "V2RayEZ-License")?;
        VerifiedLicense::from_payload(payload)
    }

    pub fn verify_grace_token(&self, token: &str) -> Result<VerifiedGraceToken, LicenseError> {
        let payload = self.verify_compact_token(token, "V2RayEZ-License-Grace")?;
        VerifiedGraceToken::from_payload(payload)
    }

    pub fn verify_revocation_list(&self, token: &str) -> Result<SignedRevocationList, LicenseError> {
        let payload = self.verify_compact_token(token, "V2RayEZ-Revocation-List")?;
        let schema = payload.get("schema").and_then(Value::as_str).unwrap_or_default();
        if schema != "v2rayez.license.revocations.v1" {
            return Err(LicenseError::UnsupportedRevocationSchema(schema.to_string()));
        }
        serde_json::from_value(payload).map_err(|error| LicenseError::InvalidJson(error.to_string()))
    }

    pub fn offline_start_decision(
        &self,
        account_id: &str,
        device_id: &str,
        platform: &str,
        signed_license_key: &str,
        signed_grace_token: Option<&str>,
        signed_revocation_list: Option<&str>,
        last_seen_server_time: Option<DateTime<Utc>>,
        now: DateTime<Utc>,
    ) -> LicenseDecision {
        let license = match self.verify_license_key(signed_license_key) {
            Ok(license) => license,
            Err(error) => return LicenseDecision::deny(format!("license_signature_invalid:{error}")),
        };

        if license.status != "ACTIVE" {
            return LicenseDecision { verified_license: Some(license), ..LicenseDecision::deny("license_not_active") };
        }
        if license.account_id != account_id {
            return LicenseDecision { verified_license: Some(license), ..LicenseDecision::deny("account_mismatch") };
        }
        if now >= license.expires_at {
            return LicenseDecision { verified_license: Some(license), ..LicenseDecision::deny("license_expired") };
        }

        // Serial-level device binding: the signed serial itself can pin a device
        // hash without requiring a grace-token fallback.
        if let Some(bound_hash) = license.device_id_hash.as_deref() {
            let expected_device_hash = self.hash_device_id(device_id);
            if !bound_hash.is_empty() && bound_hash != expected_device_hash {
                return LicenseDecision { verified_license: Some(license), ..LicenseDecision::deny("device_mismatch") };
            }
        }

        // A signed revocation-list token is the only offline deny channel. If a
        // token is present it must verify and be schema-valid; both failure modes
        // fail closed.
        if let Some(token) = signed_revocation_list {
            let list = match self.verify_revocation_list(token) {
                Ok(list) => list,
                Err(error) => return LicenseDecision { verified_license: Some(license), ..LicenseDecision::deny(format!("revocation_list_invalid:{error}")) },
            };
            if list.revokes(&license.license_id, license.revocation_epoch) {
                return LicenseDecision { verified_license: Some(license), ..LicenseDecision::deny("license_revoked") };
            }
        }

        let Some(grace_token) = signed_grace_token else {
            // No grace token required: a valid signed serial within its own window
            // is allowed offline.
            return LicenseDecision::allow_offline("signed_serial_valid", license.expires_at, license);
        };
        let grace = match self.verify_grace_token(grace_token) {
            Ok(grace) => grace,
            Err(error) => return LicenseDecision { verified_license: Some(license), ..LicenseDecision::deny(format!("grace_signature_invalid:{error}")) },
        };

        let expected_device_hash = self.hash_device_id(device_id);
        if grace.license_id != license.license_id || grace.user_id != license.user_id || grace.account_id != license.account_id {
            return LicenseDecision { verified_license: Some(license), verified_grace: Some(grace), ..LicenseDecision::deny("grace_license_mismatch") };
        }
        if grace.device_id_hash != expected_device_hash {
            return LicenseDecision { verified_license: Some(license), verified_grace: Some(grace), ..LicenseDecision::deny("device_mismatch") };
        }
        if grace.platform != platform {
            return LicenseDecision { verified_license: Some(license), verified_grace: Some(grace), ..LicenseDecision::deny("platform_mismatch") };
        }
        if grace.status != "ACTIVE" {
            return LicenseDecision { verified_license: Some(license), verified_grace: Some(grace), ..LicenseDecision::deny("grace_not_active") };
        }
        if let Some(last_server_time) = last_seen_server_time {
            if grace.server_time + chrono::Duration::seconds(self.max_clock_rollback_seconds) < last_server_time {
                return LicenseDecision { verified_license: Some(license), verified_grace: Some(grace), ..LicenseDecision::deny("server_time_rollback_detected") };
            }
        }
        if now >= grace.grace_until {
            return LicenseDecision { verified_license: Some(license), verified_grace: Some(grace), ..LicenseDecision::deny("offline_grace_expired") };
        }

        let cutoff = std::cmp::min(license.expires_at, grace.grace_until);
        LicenseDecision::allow("valid_grace", cutoff, license, grace)
    }

    fn verify_compact_token(&self, token: &str, expected_type: &str) -> Result<Value, LicenseError> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 || parts.iter().any(|part| part.is_empty()) {
            return Err(LicenseError::InvalidTokenFormat);
        }
        let header_bytes = URL_SAFE_NO_PAD.decode(parts[0]).map_err(|e| LicenseError::InvalidBase64(e.to_string()))?;
        let payload_bytes = URL_SAFE_NO_PAD.decode(parts[1]).map_err(|e| LicenseError::InvalidBase64(e.to_string()))?;
        let signature_bytes = URL_SAFE_NO_PAD.decode(parts[2]).map_err(|e| LicenseError::InvalidBase64(e.to_string()))?;
        let header: Value = serde_json::from_slice(&header_bytes).map_err(|e| LicenseError::InvalidJson(e.to_string()))?;
        let payload: Value = serde_json::from_slice(&payload_bytes).map_err(|e| LicenseError::InvalidJson(e.to_string()))?;

        let alg = header.get("alg").and_then(Value::as_str).unwrap_or_default();
        if alg != "EdDSA" {
            return Err(LicenseError::UnsupportedAlgorithm(alg.to_string()));
        }
        let typ = header.get("typ").and_then(Value::as_str).unwrap_or_default();
        if typ != expected_type {
            return Err(LicenseError::UnexpectedType { expected: expected_type.to_string(), actual: typ.to_string() });
        }
        let kid = header.get("kid").and_then(Value::as_str).unwrap_or("default");
        let key_bytes = self.public_keys.get(kid).or_else(|| self.public_keys.get("default")).ok_or_else(|| LicenseError::UnknownKeyId(kid.to_string()))?;
        let key_array: [u8; 32] = key_bytes.as_slice().try_into().map_err(|_| LicenseError::InvalidPublicKey(kid.to_string()))?;
        let verifying_key = VerifyingKey::from_bytes(&key_array).map_err(|_| LicenseError::InvalidPublicKey(kid.to_string()))?;
        let signature = Signature::from_slice(&signature_bytes).map_err(|_| LicenseError::BadSignature)?;
        let signing_input = format!("{}.{}", parts[0], parts[1]);
        verifying_key.verify(signing_input.as_bytes(), &signature).map_err(|_| LicenseError::BadSignature)?;
        Ok(payload)
    }
}

impl VerifiedLicense {
    fn from_payload(payload: Value) -> Result<Self, LicenseError> {
        Ok(Self {
            license_id: string_field(&payload, "licenseId")?,
            user_id: string_field(&payload, "userId")?,
            account_id: string_field(&payload, "accountId")?,
            status: string_field(&payload, "status")?,
            issued_at: time_field(&payload, "issuedAt")?,
            expires_at: time_field(&payload, "expiresAt")?,
            max_devices: payload.get("maxDevices").and_then(Value::as_u64).unwrap_or(1).min(u32::MAX as u64) as u32,
            offline_grace_hours: payload.get("offlineGraceHours").and_then(Value::as_u64).unwrap_or(72).min(u32::MAX as u64) as u32,
            features: payload.get("features").and_then(Value::as_array).map(|arr| arr.iter().filter_map(Value::as_str).map(ToOwned::to_owned).collect()).unwrap_or_default(),
            device_id_hash: payload.get("deviceIdHash").and_then(Value::as_str).map(ToOwned::to_owned).filter(|value| !value.is_empty()),
            revocation_epoch: payload.get("revocationEpoch").and_then(Value::as_u64).unwrap_or(0),
            raw_payload: payload,
        })
    }
}

impl VerifiedGraceToken {
    fn from_payload(payload: Value) -> Result<Self, LicenseError> {
        Ok(Self {
            license_id: string_field(&payload, "licenseId")?,
            user_id: string_field(&payload, "userId")?,
            account_id: string_field(&payload, "accountId")?,
            device_id_hash: string_field(&payload, "deviceIdHash")?,
            platform: string_field(&payload, "platform")?,
            status: string_field(&payload, "status")?,
            server_time: time_field(&payload, "serverTime")?,
            grace_until: time_field(&payload, "graceUntil")?,
            expires_at: time_field(&payload, "expiresAt")?,
            raw_payload: payload,
        })
    }
}

fn string_field(payload: &Value, name: &'static str) -> Result<String, LicenseError> {
    payload.get(name).and_then(Value::as_str).map(ToOwned::to_owned).ok_or(LicenseError::MissingField(name))
}

fn time_field(payload: &Value, name: &'static str) -> Result<DateTime<Utc>, LicenseError> {
    let value = string_field(payload, name)?;
    DateTime::parse_from_rfc3339(&value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| LicenseError::InvalidTimestamp { field: name, value })
}

fn sha256_base64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_hash_is_stable_and_salted() {
        let verifier = LicenseVerifier::new(BTreeMap::new(), "0123456789abcdef").unwrap();
        assert_eq!(verifier.hash_device_id("device-1"), verifier.hash_device_id("device-1"));
        assert_ne!(verifier.hash_device_id("device-1"), verifier.hash_device_id("device-2"));
    }
}
