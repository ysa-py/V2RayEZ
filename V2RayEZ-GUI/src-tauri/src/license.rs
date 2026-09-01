use crate::secure_store;
use crate::settings::Settings;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use v2rayez_universal_core::license::LicenseVerifier;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredLicenseState {
    device_id: String,
    license_key: Option<String>,
    grace_token: Option<String>,
    last_seen_server_time: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub allowed: bool,
    pub result: String,
    pub reason: String,
    pub source: String,
    pub expires_at: String,
    pub offline_grace_until: String,
    pub remaining_seconds: i64,
    pub redacted_serial: String,
    pub device_id_preview: String,
}

pub async fn activate(
    app: AppHandle,
    settings: Settings,
    license_key: String,
) -> Result<LicenseStatus, String> {
    let mut state = load_or_init_state(&app)?;
    let serial = license_key.trim();
    if serial.is_empty() {
        return Ok(deny("empty_license", &state));
    }
    state.license_key = Some(serial.to_string());
    save_state(&app, &state)?;
    let status = validate(app.clone(), settings, true).await?;
    if !status.allowed && matches!(status.reason.as_str(), "bad_signature" | "license_not_configured") {
        let mut updated = load_or_init_state(&app)?;
        updated.license_key = None;
        save_state(&app, &updated)?;
    }
    Ok(status)
}

pub async fn validate(
    app: AppHandle,
    settings: Settings,
    force_online: bool,
) -> Result<LicenseStatus, String> {
    let mut state = load_or_init_state(&app)?;
    let Some(license_key) = state.license_key.clone() else {
        return Ok(deny("license_missing", &state));
    };
    let verifier = verifier()?;
    let local = match local_signed_decision(&verifier, &settings, &license_key, &state) {
        Ok(status) if status.allowed => status,
        Ok(status) => return Ok(status),
        Err(error) => return Ok(status_from_reason(error, &state)),
    };

    let endpoint = validation_endpoint(&settings.license.validation_url);
    if endpoint.is_empty() {
        return offline_or_local(&verifier, &settings, &license_key, &state, local);
    }

    match validate_online(&endpoint, &settings, &license_key, &state.device_id).await {
        Ok(online) => {
            if let Some(grace) = online
                .get("graceToken")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
            {
                state.grace_token = Some(grace.to_string());
            }
            if let Some(server_time) = online.get("serverTime").and_then(Value::as_str) {
                state.last_seen_server_time = Some(server_time.to_string());
            }
            save_state(&app, &state)?;
            Ok(LicenseStatus {
                allowed: true,
                result: "ALLOWED".into(),
                reason: online
                    .get("reason")
                    .and_then(Value::as_str)
                    .unwrap_or("valid")
                    .to_string(),
                source: "server".into(),
                expires_at: online
                    .get("expiresAt")
                    .and_then(Value::as_str)
                    .unwrap_or(local.expires_at.as_str())
                    .to_string(),
                offline_grace_until: online
                    .get("offlineGraceUntil")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                remaining_seconds: online
                    .get("remainingSeconds")
                    .and_then(Value::as_i64)
                    .unwrap_or(local.remaining_seconds),
                redacted_serial: redact(&license_key),
                device_id_preview: preview(&state.device_id),
            })
        }
        Err(error) if !force_online && settings.license.allow_offline_grace => {
            let mut offline = offline_decision(&verifier, &settings, &license_key, &state);
            if offline.allowed {
                offline.reason = format!("server_unreachable_using_grace:{error}");
            }
            Ok(offline)
        }
        Err(error) => Ok(LicenseStatus {
            allowed: false,
            result: "DENIED".into(),
            reason: format!("server_unreachable:{error}"),
            source: "server".into(),
            expires_at: local.expires_at,
            offline_grace_until: String::new(),
            remaining_seconds: 0,
            redacted_serial: redact(&license_key),
            device_id_preview: preview(&state.device_id),
        }),
    }
}

pub async fn enforce(app: AppHandle, settings: &Settings) -> Result<LicenseStatus, String> {
    let status = validate(app, settings.clone(), false).await?;
    if status.allowed {
        Ok(status)
    } else {
        Err(format!("License check failed: {}", status.reason))
    }
}

pub fn clear(app: AppHandle) -> Result<LicenseStatus, String> {
    let mut state = load_or_init_state(&app)?;
    state.license_key = None;
    state.grace_token = None;
    save_state(&app, &state)?;
    Ok(deny("serial_cleared", &state))
}

fn local_signed_decision(
    verifier: &LicenseVerifier,
    settings: &Settings,
    license_key: &str,
    state: &StoredLicenseState,
) -> Result<LicenseStatus, String> {
    let license = verifier
        .verify_license_key(license_key)
        .map_err(|error| format!("bad_signature:{error}"))?;
    if license.status != "ACTIVE" {
        return Ok(status(false, "license_not_active", "signed_serial", &license.expires_at.to_rfc3339(), "", 0, license_key, state));
    }
    if !settings.license.account_id.trim().is_empty()
        && license.account_id != settings.license.account_id.trim()
    {
        return Ok(status(false, "account_mismatch", "signed_serial", &license.expires_at.to_rfc3339(), "", 0, license_key, state));
    }
    let remaining = license.expires_at.timestamp() - Utc::now().timestamp();
    if remaining <= 0 {
        return Ok(status(false, "license_expired", "signed_serial", &license.expires_at.to_rfc3339(), "", 0, license_key, state));
    }
    Ok(status(true, "signed_serial_valid", "signed_serial", &license.expires_at.to_rfc3339(), "", remaining, license_key, state))
}

fn offline_or_local(
    verifier: &LicenseVerifier,
    settings: &Settings,
    license_key: &str,
    state: &StoredLicenseState,
    local: LicenseStatus,
) -> Result<LicenseStatus, String> {
    if state.grace_token.is_some() && settings.license.allow_offline_grace {
        Ok(offline_decision(verifier, settings, license_key, state))
    } else {
        Ok(LicenseStatus {
            allowed: false,
            result: "DENIED".into(),
            reason: "online_validation_or_grace_token_required".into(),
            source: "signed_serial".into(),
            remaining_seconds: 0,
            ..local
        })
    }
}

fn offline_decision(
    verifier: &LicenseVerifier,
    settings: &Settings,
    license_key: &str,
    state: &StoredLicenseState,
) -> LicenseStatus {
    let last_seen: Option<DateTime<Utc>> = state
        .last_seen_server_time
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc));
    let decision = verifier.offline_start_decision(
        settings.license.account_id.trim(),
        &state.device_id,
        desktop_platform(),
        license_key,
        state.grace_token.as_deref(),
        last_seen,
        Utc::now(),
    );
    let expires = decision
        .verified_license
        .as_ref()
        .map(|license| license.expires_at.to_rfc3339())
        .unwrap_or_default();
    let grace_until = decision
        .verified_grace
        .as_ref()
        .map(|grace| grace.grace_until.to_rfc3339())
        .unwrap_or_default();
    let remaining = decision
        .hard_cutoff_at
        .map(|cutoff| (cutoff.timestamp() - Utc::now().timestamp()).max(0))
        .unwrap_or(0);
    status(
        decision.allowed,
        &decision.reason,
        "offline_grace",
        &expires,
        &grace_until,
        remaining,
        license_key,
        state,
    )
}

async fn validate_online(
    endpoint: &str,
    settings: &Settings,
    license_key: &str,
    device_id: &str,
) -> Result<Value, String> {
    let payload = json!({
        "licenseKey": license_key,
        "deviceId": device_id,
        "accountId": settings.license.account_id.trim(),
        "platform": desktop_platform(),
        "appVersion": env!("CARGO_PKG_VERSION"),
        "deviceLabel": device_label(settings),
    });
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?
        .post(endpoint)
        .json(&payload)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status_code = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    let value: Value = serde_json::from_str(&body).map_err(|error| format!("invalid validation response: {error}"))?;
    if !status_code.is_success() || !value.get("success").and_then(Value::as_bool).unwrap_or(false) {
        let reason = value
            .get("reason")
            .and_then(Value::as_str)
            .unwrap_or("license_denied");
        return Err(reason.to_string());
    }
    Ok(value)
}

fn verifier() -> Result<LicenseVerifier, String> {
    let mut keys = BTreeMap::new();
    if let Some(raw) = env_or_option("V2RAYEZ_LICENSE_PUBLIC_KEYS_JSON", option_env!("V2RAYEZ_LICENSE_PUBLIC_KEYS_JSON")) {
        let parsed: Value = serde_json::from_str(&raw).map_err(|error| format!("invalid public keys JSON: {error}"))?;
        if let Some(map) = parsed.as_object() {
            for (kid, pem) in map {
                if let Some(pem) = pem.as_str() {
                    keys.insert(kid.clone(), public_key_bytes(pem)?);
                }
            }
        }
    }
    if let Some(pem) = env_or_option("V2RAYEZ_LICENSE_PUBLIC_KEY_PEM", option_env!("V2RAYEZ_LICENSE_PUBLIC_KEY_PEM")) {
        keys.entry("default".into()).or_insert(public_key_bytes(&pem)?);
    }
    if keys.is_empty() {
        return Err("license_not_configured".into());
    }
    LicenseVerifier::new(keys, device_hash_salt()).map_err(|error| error.to_string())
}

fn public_key_bytes(pem_or_raw: &str) -> Result<Vec<u8>, String> {
    let body: String = pem_or_raw
        .replace("\\n", "\n")
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .map(str::trim)
        .collect();
    let der = STANDARD
        .decode(body.as_bytes())
        .map_err(|error| format!("invalid public key base64: {error}"))?;
    if der.len() == 32 {
        Ok(der)
    } else if der.len() > 32 {
        Ok(der[der.len() - 32..].to_vec())
    } else {
        Err("invalid ed25519 public key length".into())
    }
}

fn device_hash_salt() -> String {
    env_or_option("V2RAYEZ_LICENSE_DEVICE_HASH_SALT", option_env!("V2RAYEZ_LICENSE_DEVICE_HASH_SALT"))
        .unwrap_or_else(|| "v2rayez-client-device-binding-v1".into())
}

fn env_or_option(name: &str, compiled: Option<&'static str>) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| compiled.map(ToOwned::to_owned).filter(|value| !value.trim().is_empty()))
}

fn validation_endpoint(raw: &str) -> String {
    let base = raw.trim().trim_end_matches('/');
    if base.is_empty() {
        String::new()
    } else if base.ends_with("/api/licenses/validate") {
        base.to_string()
    } else {
        format!("{base}/api/licenses/validate")
    }
}

fn device_label(settings: &Settings) -> String {
    if !settings.license.device_label.trim().is_empty() {
        return settings.license.device_label.trim().into();
    }
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Desktop device".into())
}

fn desktop_platform() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

fn load_or_init_state(app: &AppHandle) -> Result<StoredLicenseState, String> {
    let path = state_path(app)?;
    let mut state = if path.exists() {
        serde_json::from_slice::<StoredLicenseState>(&secure_store::protected_read(&path)?)
            .map_err(|error| format!("license state is invalid: {error}"))?
    } else {
        StoredLicenseState::default()
    };
    if state.device_id.is_empty() {
        state.device_id = generate_device_id();
        save_state(app, &state)?;
    }
    Ok(state)
}

fn save_state(app: &AppHandle, state: &StoredLicenseState) -> Result<(), String> {
    let path = state_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(display_err)?;
    }
    secure_store::protected_write(&path, &serde_json::to_vec_pretty(state).map_err(display_err)?)
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(display_err)?
        .join("license-state.json"))
}

fn generate_device_id() -> String {
    let seed = format!(
        "{}:{}:{}:{:?}",
        std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_default(),
        std::process::id(),
        env!("CARGO_PKG_VERSION"),
        std::time::SystemTime::now()
    );
    hex(&Sha256::digest(seed.as_bytes()))
}

fn status(
    allowed: bool,
    reason: &str,
    source: &str,
    expires_at: &str,
    offline_grace_until: &str,
    remaining_seconds: i64,
    license_key: &str,
    state: &StoredLicenseState,
) -> LicenseStatus {
    LicenseStatus {
        allowed,
        result: if allowed { "ALLOWED" } else { "DENIED" }.into(),
        reason: reason.into(),
        source: source.into(),
        expires_at: expires_at.into(),
        offline_grace_until: offline_grace_until.into(),
        remaining_seconds: remaining_seconds.max(0),
        redacted_serial: redact(license_key),
        device_id_preview: preview(&state.device_id),
    }
}

fn deny(reason: &str, state: &StoredLicenseState) -> LicenseStatus {
    status(false, reason, "local", "", "", 0, state.license_key.as_deref().unwrap_or_default(), state)
}

fn status_from_reason(reason: String, state: &StoredLicenseState) -> LicenseStatus {
    let normalized = reason.split(':').next().unwrap_or(reason.as_str());
    deny(normalized, state)
}

fn redact(value: &str) -> String {
    if value.is_empty() {
        String::new()
    } else if value.len() <= 16 {
        format!("{}…{}", &value[..value.len().min(4)], &value[value.len().saturating_sub(4)..])
    } else {
        format!("{}…{}", &value[..10], &value[value.len() - 8..])
    }
}

fn preview(value: &str) -> String {
    value.chars().take(8).collect()
}

fn hex(bytes: &[u8]) -> String {
    const TABLE: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(TABLE[(byte >> 4) as usize] as char);
        out.push(TABLE[(byte & 0x0f) as usize] as char);
    }
    out
}

fn display_err(error: impl std::fmt::Display) -> String {
    error.to_string()
}
