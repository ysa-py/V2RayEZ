use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::Utc;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use v2rayez_universal_core::license::{LicenseDecision, LicenseVerifier};

#[derive(Debug, Clone)]
struct Args {
    mode: String,
    license_file: PathBuf,
    grace_file: PathBuf,
    revocation_list_file: PathBuf,
    public_key_file: PathBuf,
    validation_url: String,
    account_id: String,
    device_id: String,
    platform: String,
    device_label: String,
    client_last_server_time: String,
    uci_config: String,
    uci_section: String,
    allow_offline_grace: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GateStatus {
    allowed: bool,
    result: &'static str,
    reason: String,
    source: &'static str,
    expires_at: String,
    offline_grace_until: String,
    remaining_seconds: i64,
    device_id_preview: String,
    server_time: String,
}

fn main() {
    let args = match parse_args() {
        Ok(args) => args,
        Err(error) => exit_status(deny(&error, "args", None, None, ""), None),
    };

    let status = match run(&args) {
        Ok(status) => status,
        Err(error) => deny(&error, "local", None, None, &args.device_id),
    };
    exit_status(status, Some(&args));
}

fn run(args: &Args) -> Result<GateStatus, String> {
    let license_key = read_trimmed(&args.license_file)?;
    if license_key.is_empty() {
        return Ok(deny("license_missing", "local", None, None, &args.device_id));
    }

    let public_key_pem = read_trimmed(&args.public_key_file)?;
    let mut keys = BTreeMap::new();
    keys.insert("default".to_string(), public_key_bytes(&public_key_pem)?);
    let verifier = LicenseVerifier::new(keys, device_hash_salt()).map_err(|error| error.to_string())?;

    let verified = match verifier.verify_license_key(&license_key) {
        Ok(license) => license,
        Err(error) => {
            return Ok(deny(
                &format!("license_signature_invalid:{error}"),
                "signed_serial",
                None,
                None,
                &args.device_id,
            ));
        }
    };

    let expires_at = verified.expires_at.to_rfc3339();
    if verified.status != "ACTIVE" {
        return Ok(deny("license_not_active", "signed_serial", Some(expires_at), None, &args.device_id));
    }
    if !args.account_id.trim().is_empty() && verified.account_id != args.account_id.trim() {
        return Ok(deny("account_mismatch", "signed_serial", Some(expires_at), None, &args.device_id));
    }
    let remaining = verified.expires_at.timestamp() - Utc::now().timestamp();
    if remaining <= 0 {
        return Ok(deny("license_expired", "signed_serial", Some(expires_at), None, &args.device_id));
    }

    if !args.validation_url.trim().is_empty() {
        match validate_online(args, &license_key) {
            Ok(status) => return Ok(status),
            // Offline serial fallback does NOT require a grace token. A valid,
            // device-bound, non-revoked signed serial may keep running when the
            // validation endpoint is unreachable. `allow_offline_grace` is no
            // longer a gate for this path.
            Err(error) if args.mode != "activate" => {
                let offline = offline_decision(args, &verifier, &license_key, Some(format!("server_unreachable_using_serial:{error}")));
                if offline.allowed {
                    return Ok(offline);
                }
                return Ok(deny(&format!("server_unreachable:{error}"), "server", Some(expires_at), None, &args.device_id));
            }
            Err(error) => {
                return Ok(deny(&format!("server_unreachable:{error}"), "server", Some(expires_at), None, &args.device_id));
            }
        }
    }

    // No validation endpoint configured: accept the signed serial offline if it
    // is valid, within its own expiry, device-bound when signed so, and not
    // present on a valid signed revocation list.
    Ok(offline_decision(args, &verifier, &license_key, None))
}

fn validate_online(args: &Args, license_key: &str) -> Result<GateStatus, String> {
    let endpoint = validation_endpoint(&args.validation_url);
    let mut payload_value = json!({
        "licenseKey": license_key,
        "deviceId": args.device_id,
        "accountId": args.account_id,
        "platform": args.platform,
        "deviceLabel": args.device_label,
    });
    if !args.client_last_server_time.trim().is_empty() {
        payload_value["clientLastServerTime"] = json!(args.client_last_server_time.trim());
    }
    let payload = payload_value.to_string();

    let body = post_json(&endpoint, &payload)?;
    let value: Value = serde_json::from_str(&body).map_err(|error| format!("invalid_validation_response:{error}"))?;
    if !value.get("success").and_then(Value::as_bool).unwrap_or(false) {
        let reason = value.get("reason").and_then(Value::as_str).unwrap_or("license_denied");
        return Err(reason.to_string());
    }

    if let Some(grace) = value.get("graceToken").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        if let Some(parent) = args.grace_file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&args.grace_file, format!("{grace}\n")).map_err(|error| format!("write_grace_failed:{error}"))?;
        set_mode_600(&args.grace_file);
    }

    Ok(GateStatus {
        allowed: true,
        result: "ALLOWED",
        reason: value.get("reason").and_then(Value::as_str).unwrap_or("server_valid").to_string(),
        source: "server",
        expires_at: value.get("expiresAt").and_then(Value::as_str).unwrap_or_default().to_string(),
        offline_grace_until: value.get("offlineGraceUntil").and_then(Value::as_str).unwrap_or_default().to_string(),
        remaining_seconds: value.get("remainingSeconds").and_then(Value::as_i64).unwrap_or(0).max(0),
        device_id_preview: preview(&args.device_id),
        server_time: value.get("serverTime").and_then(Value::as_str).unwrap_or_default().to_string(),
    })
}

fn offline_decision(
    args: &Args,
    verifier: &LicenseVerifier,
    license_key: &str,
    allowed_reason: Option<String>,
) -> GateStatus {
    let grace = read_trimmed(&args.grace_file).ok().filter(|value| !value.is_empty());
    let revocation_list = read_trimmed(&args.revocation_list_file).ok().filter(|value| !value.is_empty());
    let decision = verifier.offline_start_decision(
        args.account_id.trim(),
        &args.device_id,
        &args.platform,
        license_key,
        grace.as_deref(),
        revocation_list.as_deref(),
        parse_rfc3339_utc(&args.client_last_server_time),
        Utc::now(),
    );
    status_from_decision(args, decision, allowed_reason)
}

fn status_from_decision(args: &Args, decision: LicenseDecision, allowed_reason: Option<String>) -> GateStatus {
    let expires_at = decision
        .verified_license
        .as_ref()
        .map(|license| license.expires_at.to_rfc3339())
        .unwrap_or_default();
    let grace_until = decision
        .verified_grace
        .as_ref()
        .map(|grace| grace.grace_until.to_rfc3339())
        .unwrap_or_default();
    let server_time = decision
        .verified_grace
        .as_ref()
        .map(|grace| grace.server_time.to_rfc3339())
        .unwrap_or_default();
    let remaining = decision
        .hard_cutoff_at
        .as_ref()
        .map(|cutoff| cutoff.timestamp() - Utc::now().timestamp())
        .unwrap_or(0)
        .max(0);
    GateStatus {
        allowed: decision.allowed,
        result: if decision.allowed { "ALLOWED" } else { "DENIED" },
        reason: if decision.allowed { allowed_reason.unwrap_or(decision.reason) } else { decision.reason },
        source: "offline_grace",
        expires_at,
        offline_grace_until: grace_until,
        remaining_seconds: remaining,
        device_id_preview: preview(&args.device_id),
        server_time,
    }
}

fn post_json(endpoint: &str, payload: &str) -> Result<String, String> {
    let attempts: Vec<(&str, Vec<String>)> = vec![
        (
            "curl",
            vec![
                "-fsS".into(),
                "--max-time".into(),
                "25".into(),
                "-H".into(),
                "Content-Type: application/json".into(),
                "-H".into(),
                "Accept: application/json".into(),
                "-d".into(),
                payload.into(),
                endpoint.into(),
            ],
        ),
        (
            "uclient-fetch",
            vec![
                "-q".into(),
                "-O".into(),
                "-".into(),
                "--timeout=25".into(),
                "--header=Content-Type: application/json".into(),
                "--header=Accept: application/json".into(),
                format!("--post-data={payload}"),
                endpoint.into(),
            ],
        ),
        (
            "wget",
            vec![
                "-qO-".into(),
                "--timeout=25".into(),
                "--header=Content-Type: application/json".into(),
                "--header=Accept: application/json".into(),
                format!("--post-data={payload}"),
                endpoint.into(),
            ],
        ),
    ];

    let mut last_error = "http_client_missing".to_string();
    for (program, args) in attempts {
        match Command::new(program).args(&args).output() {
            Ok(output) if output.status.success() => {
                let body = String::from_utf8_lossy(&output.stdout).to_string();
                if body.trim().is_empty() {
                    last_error = format!("{program}_empty_response");
                } else {
                    return Ok(body);
                }
            }
            Ok(output) => last_error = format!("{program}_exit_{}", output.status.code().unwrap_or(-1)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => last_error = format!("{program}:{error}"),
        }
    }
    Err(last_error)
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        mode: "enforce".to_string(),
        license_file: PathBuf::from("/etc/unifiedshield/license.token"),
        grace_file: PathBuf::from("/etc/unifiedshield/license.grace"),
        revocation_list_file: PathBuf::from("/etc/unifiedshield/license-revocations.token"),
        public_key_file: PathBuf::from("/etc/unifiedshield/license-public.pem"),
        validation_url: String::new(),
        account_id: String::new(),
        device_id: String::new(),
        platform: "openwrt".to_string(),
        device_label: "OpenWrt router".to_string(),
        client_last_server_time: String::new(),
        uci_config: "unifiedshield".to_string(),
        uci_section: "default".to_string(),
        allow_offline_grace: false,
    };

    let mut it = env::args().skip(1);
    while let Some(flag) = it.next() {
        match flag.as_str() {
            "--allow-offline-grace" => args.allow_offline_grace = true,
            "--mode" => args.mode = next_value(&mut it, &flag)?,
            "--license-file" => args.license_file = PathBuf::from(next_value(&mut it, &flag)?),
            "--grace-file" => args.grace_file = PathBuf::from(next_value(&mut it, &flag)?),
            "--revocation-list-file" => args.revocation_list_file = PathBuf::from(next_value(&mut it, &flag)?),
            "--public-key-file" => args.public_key_file = PathBuf::from(next_value(&mut it, &flag)?),
            "--validation-url" => args.validation_url = next_value(&mut it, &flag)?,
            "--account-id" => args.account_id = next_value(&mut it, &flag)?,
            "--device-id" => args.device_id = next_value(&mut it, &flag)?,
            "--platform" => args.platform = next_value(&mut it, &flag)?,
            "--device-label" => args.device_label = next_value(&mut it, &flag)?,
            "--client-last-server-time" => args.client_last_server_time = next_value(&mut it, &flag)?,
            "--uci-config" => args.uci_config = next_value(&mut it, &flag)?,
            "--uci-section" => args.uci_section = next_value(&mut it, &flag)?,
            _ => return Err(format!("unknown_arg:{flag}")),
        }
    }
    if args.device_id.trim().is_empty() {
        return Err("device_id_missing".to_string());
    }
    Ok(args)
}

fn next_value(it: &mut impl Iterator<Item = String>, flag: &str) -> Result<String, String> {
    it.next().ok_or_else(|| format!("missing_value:{flag}"))
}

fn exit_status(status: GateStatus, args: Option<&Args>) -> ! {
    if let Some(args) = args {
        update_uci(args, &status);
    }
    println!("{}", serde_json::to_string(&status).unwrap_or_else(|_| "{}".to_string()));
    std::process::exit(if status.allowed { 0 } else { 1 });
}

fn update_uci(args: &Args, status: &GateStatus) {
    let prefix = format!("{}.{}", args.uci_config, args.uci_section);
    let values = [
        ("license_last_result", status.result.to_string()),
        ("license_last_reason", status.reason.clone()),
        ("license_expires_at", status.expires_at.clone()),
        ("license_offline_grace_until", status.offline_grace_until.clone()),
        ("license_last_server_time", status.server_time.clone()),
    ];
    for (key, value) in values {
        if key == "license_last_server_time" && (!status.allowed || value.is_empty()) {
            continue;
        }
        let _ = Command::new("uci").args(["-q", "set", &format!("{prefix}.{key}={value}")]).status();
    }
    let _ = Command::new("uci").args(["-q", "commit", &args.uci_config]).status();
}

fn deny(
    reason: &str,
    source: &'static str,
    expires_at: Option<String>,
    offline_grace_until: Option<String>,
    device_id: &str,
) -> GateStatus {
    GateStatus {
        allowed: false,
        result: "DENIED",
        reason: reason.to_string(),
        source,
        expires_at: expires_at.unwrap_or_default(),
        offline_grace_until: offline_grace_until.unwrap_or_default(),
        remaining_seconds: 0,
        device_id_preview: preview(device_id),
        server_time: String::new(),
    }
}

fn parse_rfc3339_utc(value: &str) -> Option<chrono::DateTime<Utc>> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(trimmed).ok().map(|time| time.with_timezone(&Utc))
}

fn read_trimmed(path: &Path) -> Result<String, String> {
    fs::read_to_string(path)
        .map(|value| value.trim().to_string())
        .map_err(|error| format!("read_failed:{}:{error}", path.display()))
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
        .map_err(|error| format!("invalid_public_key_base64:{error}"))?;
    if der.len() == 32 {
        Ok(der)
    } else if der.len() > 32 {
        Ok(der[der.len() - 32..].to_vec())
    } else {
        Err("invalid_ed25519_public_key_length".to_string())
    }
}

fn validation_endpoint(raw: &str) -> String {
    let base = raw.trim().trim_end_matches('/');
    if base.ends_with("/api/licenses/validate") {
        base.to_string()
    } else {
        format!("{base}/api/licenses/validate")
    }
}

fn device_hash_salt() -> String {
    env::var("V2RAYEZ_LICENSE_DEVICE_HASH_SALT")
        .ok()
        .filter(|value| value.len() >= 16)
        .unwrap_or_else(|| "v2rayez-client-device-binding-v1".to_string())
}

fn set_mode_600(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(path) {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o600);
            let _ = fs::set_permissions(path, permissions);
        }
    }
}

fn preview(value: &str) -> String {
    value.chars().take(8).collect()
}
