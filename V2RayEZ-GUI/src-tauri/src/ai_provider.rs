use crate::secure_store;
use crate::settings::{AiProviderSettings, Settings};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderResult {
    pub success: bool,
    pub provider_id: String,
    pub provider_name: String,
    pub source: String,
    pub text: String,
    pub error: String,
    pub blocked_or_unreachable: bool,
}

pub async fn test_provider(
    app: AppHandle,
    settings: Settings,
    provider_id: String,
    api_secret: Option<String>,
) -> Result<AiProviderResult, String> {
    let provider = settings
        .ai_engine
        .providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .or_else(|| settings.ai_engine.providers.first())
        .cloned()
        .unwrap_or_default();
    if let Some(secret) = api_secret.filter(|value| !value.trim().is_empty()) {
        save_secret(app.clone(), provider.api_key_alias.clone(), secret)?;
    }
    Ok(call_or_fallback(
        &app,
        &settings,
        &provider,
        "Suggest a safe V2RayEZ anti-DPI strategy for a blocked TLS connection.",
    )
    .await)
}

pub async fn advise_on_failure(
    app: &AppHandle,
    settings: &Settings,
    failure: &str,
) -> Option<AiProviderResult> {
    if !settings.ai_engine.enabled {
        return None;
    }
    let selected = settings
        .ai_engine
        .providers
        .iter()
        .find(|provider| provider.id == settings.ai_engine.selected_provider_id)
        .or_else(|| settings.ai_engine.providers.first())?;
    Some(
        call_or_fallback(
            app,
            settings,
            selected,
            &format!("V2RayEZ desktop connection failed: {failure}. Recommend a safe anti-DPI fallback."),
        )
        .await,
    )
}

pub fn save_secret(app: AppHandle, alias: String, secret: String) -> Result<(), String> {
    let alias = sanitize_alias(&alias)?;
    let path = secret_path(&app, &alias)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(display_err)?;
    }
    secure_store::protected_write(&path, secret.as_bytes())
}

async fn call_or_fallback(
    app: &AppHandle,
    settings: &Settings,
    provider: &AiProviderSettings,
    prompt: &str,
) -> AiProviderResult {
    if provider.provider_type == "local" || provider.base_url.starts_with("local://") {
        return local_fallback(provider, prompt, "local");
    }
    match call_provider(app, provider, prompt).await {
        Ok(result) => result,
        Err(error) if settings.ai_engine.auto_fallback_to_local => {
            let mut local = local_fallback(provider, prompt, "local_fallback");
            local.error = redact(&error, app, provider);
            local.blocked_or_unreachable = true;
            local
        }
        Err(error) => AiProviderResult {
            success: false,
            provider_id: provider.id.clone(),
            provider_name: provider.name.clone(),
            source: "external".into(),
            text: String::new(),
            error: redact(&error, app, provider),
            blocked_or_unreachable: true,
        },
    }
}

async fn call_provider(
    app: &AppHandle,
    provider: &AiProviderSettings,
    prompt: &str,
) -> Result<AiProviderResult, String> {
    let url = provider_url(provider)?;
    let api_key = load_secret(app, &provider.api_key_alias).unwrap_or_default();
    let mut request = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(provider.timeout_ms.clamp(2_000, 120_000)))
        .build()
        .map_err(display_err)?
        .post(url)
        .header("accept", "application/json");
    for (key, value) in headers(provider, &api_key)? {
        request = request.header(key, value);
    }
    let response = request
        .json(&request_body(provider, prompt, &api_key))
        .send()
        .await
        .map_err(display_err)?;
    let status = response.status();
    let text = response.text().await.map_err(display_err)?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", text.chars().take(240).collect::<String>()));
    }
    let extracted = extract_text(&text, &provider.response_path);
    Ok(AiProviderResult {
        success: !extracted.is_empty(),
        provider_id: provider.id.clone(),
        provider_name: provider.name.clone(),
        source: "external".into(),
        text: extracted,
        error: String::new(),
        blocked_or_unreachable: false,
    })
}

fn provider_url(provider: &AiProviderSettings) -> Result<String, String> {
    let base = provider.base_url.trim().trim_end_matches('/');
    if !(base.starts_with("https://") || base.starts_with("http://")) {
        return Err("AI provider base URL must be http(s)".into());
    }
    let path = provider.endpoint.trim().trim_start_matches('/');
    Ok(if path.is_empty() { base.into() } else { format!("{base}/{path}") })
}

fn headers(provider: &AiProviderSettings, api_key: &str) -> Result<Vec<(String, String)>, String> {
    let mut out = Vec::new();
    match provider.provider_type.as_str() {
        "anthropic" => {
            if !api_key.is_empty() {
                out.push(("x-api-key".into(), api_key.into()));
            }
            out.push(("anthropic-version".into(), "2023-06-01".into()));
        }
        _ => {
            if !api_key.is_empty() {
                out.push(("authorization".into(), format!("Bearer {api_key}")));
            }
        }
    }
    let value: Value = serde_json::from_str(provider.headers_json.trim()).map_err(|error| error.to_string())?;
    if let Some(map) = value.as_object() {
        for (key, value) in map {
            out.push((key.clone(), render(value.as_str().unwrap_or_default(), provider, "", api_key)));
        }
    }
    Ok(out)
}

fn request_body(provider: &AiProviderSettings, prompt: &str, api_key: &str) -> Value {
    if !provider.request_template.trim().is_empty() {
        let rendered = render(&provider.request_template, provider, prompt, api_key);
        if let Ok(value) = serde_json::from_str(&rendered) {
            return value;
        }
    }
    match provider.provider_type.as_str() {
        "anthropic" => json!({"model": provider.model, "max_tokens": 512, "messages": [{"role": "user", "content": prompt}]}),
        "gemini" => json!({"contents": [{"parts": [{"text": prompt}]}]}),
        _ => json!({"model": provider.model, "messages": [{"role": "system", "content": "Return concise anti-DPI tuning guidance."}, {"role": "user", "content": prompt}]}),
    }
}

fn render(template: &str, provider: &AiProviderSettings, prompt: &str, api_key: &str) -> String {
    template
        .replace("${model}", &provider.model)
        .replace("${prompt}", prompt)
        .replace("${prompt_json}", &serde_json::to_string(prompt).unwrap_or_else(|_| "\"\"".into()))
        .replace("${api_key}", api_key)
}

fn extract_text(body: &str, configured_path: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(body) else {
        return body.chars().take(4_000).collect();
    };
    for path in [
        configured_path,
        "choices.0.message.content",
        "choices.0.text",
        "content.0.text",
        "candidates.0.content.parts.0.text",
        "text",
        "response",
        "message",
    ] {
        if path.trim().is_empty() {
            continue;
        }
        if let Some(text) = value_at_path(&value, path).filter(|value| !value.trim().is_empty()) {
            return text;
        }
    }
    String::new()
}

fn value_at_path(root: &Value, path: &str) -> Option<String> {
    let mut current = root;
    for part in path.split('.') {
        current = match current {
            Value::Object(map) => map.get(part)?,
            Value::Array(items) => items.get(part.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    match current {
        Value::String(text) => Some(text.clone()),
        Value::Null => None,
        other => Some(other.to_string()),
    }
}

fn local_fallback(provider: &AiProviderSettings, prompt: &str, source: &str) -> AiProviderResult {
    let text = if prompt.to_ascii_lowercase().contains("masque") {
        "Try MASQUE HTTP/2 fallback, then WireGuard/gool Smart Connect, while keeping kill-switch recovery active."
    } else if prompt.to_ascii_lowercase().contains("dns") {
        "Prefer proxied DNS, block leak-prone direct resolvers, and keep split-tunnel exclusions explicit."
    } else {
        "Use the local V2RayEZ policy: retry with conservative obfuscation, then switch protocol through Smart Connect."
    };
    AiProviderResult {
        success: true,
        provider_id: provider.id.clone(),
        provider_name: provider.name.clone(),
        source: source.into(),
        text: text.into(),
        error: String::new(),
        blocked_or_unreachable: false,
    }
}

fn load_secret(app: &AppHandle, alias: &str) -> Result<String, String> {
    let alias = sanitize_alias(alias)?;
    let path = secret_path(app, &alias)?;
    if !path.exists() {
        return Ok(String::new());
    }
    String::from_utf8(secure_store::protected_read(&path)?).map_err(display_err)
}

fn secret_path(app: &AppHandle, alias: &str) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(display_err)?
        .join("ai-secrets")
        .join(format!("{alias}.secret")))
}

fn sanitize_alias(alias: &str) -> Result<String, String> {
    let alias = alias.trim();
    if alias.is_empty() {
        return Err("API key alias is empty".into());
    }
    if alias.contains(['\0', '/', '\\', ':']) {
        return Err("API key alias contains invalid characters".into());
    }
    Ok(alias.into())
}

fn redact(message: &str, app: &AppHandle, provider: &AiProviderSettings) -> String {
    let secret = load_secret(app, &provider.api_key_alias).unwrap_or_default();
    if secret.is_empty() {
        message.into()
    } else {
        message.replace(&secret, "[redacted]")
    }
}

fn display_err(error: impl std::fmt::Display) -> String {
    error.to_string()
}
