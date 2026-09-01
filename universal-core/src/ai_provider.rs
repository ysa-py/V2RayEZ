use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use thiserror::Error;
use url::Url;

#[derive(Debug, Error)]
pub enum AIProviderError {
    #[error("base_url must be an http(s) URL")]
    InvalidBaseUrl,
    #[error("method must be GET, POST, PUT, or PATCH")]
    InvalidMethod,
    #[error("auth secret is required for provider auth type {0}")]
    MissingAuthSecret(String),
    #[error("request template rendering failed: {0}")]
    Render(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AIAuthType {
    None,
    Bearer,
    ApiKey,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AIProviderAuth {
    pub auth_type: AIAuthType,
    pub header_name: String,
    pub header_template: String,
    pub secret_ref: Option<String>,
}

impl Default for AIProviderAuth {
    fn default() -> Self {
        Self { auth_type: AIAuthType::None, header_name: "Authorization".to_string(), header_template: String::new(), secret_ref: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AIProviderSchema {
    pub request_template: Value,
    pub response_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AIProviderConfig {
    pub id: String,
    pub display_name: String,
    pub base_url: String,
    pub endpoint_path: String,
    pub method: String,
    pub model: String,
    pub timeout_ms: u64,
    pub headers: BTreeMap<String, String>,
    pub auth: AIProviderAuth,
    pub schema: AIProviderSchema,
    pub proxy_policy: String,
    pub censorship_probe_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AIResponseShape {
    OpenAI,
    Anthropic,
    Gemini,
    Generic,
    Empty,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AIResponseExtraction {
    pub shape: AIResponseShape,
    pub response_path: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AIProviderRequest {
    pub url: String,
    pub method: String,
    pub headers: BTreeMap<String, String>,
    pub body: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LocalAIFallback {
    pub mode: String,
    pub reason: String,
    pub engines: Vec<String>,
    pub dependency_free_core_networking: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AIProviderProbeResult {
    pub success: bool,
    pub reachable: bool,
    pub blocked: bool,
    pub status: Option<u16>,
    pub detected_shape: AIResponseShape,
    pub response_path: Option<String>,
    pub sample_text: String,
    pub fallback: Option<LocalAIFallback>,
}

impl AIProviderConfig {
    pub fn normalized(mut self) -> Result<Self, AIProviderError> {
        let parsed = Url::parse(&self.base_url).map_err(|_| AIProviderError::InvalidBaseUrl)?;
        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(AIProviderError::InvalidBaseUrl);
        }
        self.base_url = self.base_url.trim_end_matches('/').to_string();
        if !self.endpoint_path.starts_with('/') {
            self.endpoint_path = format!("/{}", self.endpoint_path);
        }
        self.method = self.method.to_uppercase();
        if !matches!(self.method.as_str(), "GET" | "POST" | "PUT" | "PATCH") {
            return Err(AIProviderError::InvalidMethod);
        }
        if self.timeout_ms < 1000 {
            self.timeout_ms = 1000;
        }
        if self.timeout_ms > 120_000 {
            self.timeout_ms = 120_000;
        }
        Ok(self)
    }

    pub fn build_request(&self, prompt: &str, system: &str, api_secret: Option<&str>) -> Result<AIProviderRequest, AIProviderError> {
        let provider = self.clone().normalized()?;
        let mut variables = BTreeMap::new();
        variables.insert("prompt".to_string(), prompt.to_string());
        variables.insert("system".to_string(), system.to_string());
        variables.insert("model".to_string(), provider.model.clone());

        let rendered_path = render_string(&provider.endpoint_path, &variables);
        let url = Url::parse(&format!("{}{}", provider.base_url, rendered_path)).map_err(|_| AIProviderError::InvalidBaseUrl)?;
        let mut headers = provider.headers.clone();
        headers.entry("accept".to_string()).or_insert_with(|| "application/json".to_string());
        let body = if provider.method == "GET" {
            None
        } else {
            headers.entry("content-type".to_string()).or_insert_with(|| "application/json".to_string());
            Some(render_value(&provider.schema.request_template, &variables))
        };

        match provider.auth.auth_type {
            AIAuthType::None => {}
            AIAuthType::Bearer | AIAuthType::ApiKey | AIAuthType::Custom => {
                let secret = api_secret.ok_or_else(|| AIProviderError::MissingAuthSecret(format!("{:?}", provider.auth.auth_type)))?;
                let value = provider.auth.header_template.replace("${apiKey}", secret);
                headers.insert(provider.auth.header_name.clone(), value);
            }
        }

        Ok(AIProviderRequest { url: url.to_string(), method: provider.method, headers, body })
    }
}

pub fn extract_response_text(json: &Value, configured_path: Option<&str>) -> AIResponseExtraction {
    if let Some(path) = configured_path.filter(|p| !p.is_empty()) {
        if let Some(text) = string_at_path(json, path) {
            return AIResponseExtraction { shape: AIResponseShape::Generic, response_path: Some(path.to_string()), text };
        }
    }
    if let Some(text) = string_at_path(json, "choices[0].message.content") {
        return AIResponseExtraction { shape: AIResponseShape::OpenAI, response_path: Some("choices[0].message.content".to_string()), text };
    }
    if let Some(text) = string_at_path(json, "choices[0].text") {
        return AIResponseExtraction { shape: AIResponseShape::OpenAI, response_path: Some("choices[0].text".to_string()), text };
    }
    if let Some(text) = string_at_path(json, "content[0].text") {
        return AIResponseExtraction { shape: AIResponseShape::Anthropic, response_path: Some("content[0].text".to_string()), text };
    }
    if let Some(text) = string_at_path(json, "candidates[0].content.parts[0].text") {
        return AIResponseExtraction { shape: AIResponseShape::Gemini, response_path: Some("candidates[0].content.parts[0].text".to_string()), text };
    }
    for path in ["text", "message", "content", "result", "output", "data.text", "data.message"] {
        if let Some(text) = string_at_path(json, path) {
            return AIResponseExtraction { shape: AIResponseShape::Generic, response_path: Some(path.to_string()), text };
        }
    }
    AIResponseExtraction { shape: AIResponseShape::Empty, response_path: None, text: String::new() }
}

pub fn local_fallback(reason: impl Into<String>) -> LocalAIFallback {
    LocalAIFallback {
        mode: "local-micafp-ai".to_string(),
        reason: reason.into(),
        engines: vec![
            "dpi_classifier".to_string(),
            "adversarial_traffic".to_string(),
            "feature_extractor".to_string(),
            "onnx_runtime".to_string(),
            "rl_transport_selector".to_string(),
            "traffic_predictor".to_string(),
            "ucb_bandit".to_string(),
        ],
        dependency_free_core_networking: true,
    }
}

fn render_value(value: &Value, variables: &BTreeMap<String, String>) -> Value {
    match value {
        Value::String(s) => Value::String(render_string(s, variables)),
        Value::Array(items) => Value::Array(items.iter().map(|item| render_value(item, variables)).collect()),
        Value::Object(map) => Value::Object(map.iter().map(|(key, value)| (key.clone(), render_value(value, variables))).collect()),
        other => other.clone(),
    }
}

fn render_string(input: &str, variables: &BTreeMap<String, String>) -> String {
    let mut out = input.to_string();
    for (key, value) in variables {
        out = out.replace(&format!("${{{key}}}"), value);
    }
    out
}

fn string_at_path(json: &Value, path: &str) -> Option<String> {
    let normalized = path.replace('[', ".").replace(']', "");
    let mut current = json;
    for part in normalized.split('.').filter(|part| !part.is_empty()) {
        if let Ok(index) = part.parse::<usize>() {
            current = current.as_array()?.get(index)?;
        } else {
            current = current.as_object()?.get(part)?;
        }
    }
    current.as_str().map(ToOwned::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_common_provider_shapes() {
        assert_eq!(extract_response_text(&json!({"choices":[{"message":{"content":"ok"}}]}), None).shape, AIResponseShape::OpenAI);
        assert_eq!(extract_response_text(&json!({"content":[{"text":"ok"}]}), None).shape, AIResponseShape::Anthropic);
        assert_eq!(extract_response_text(&json!({"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}), None).shape, AIResponseShape::Gemini);
        assert_eq!(extract_response_text(&json!({"data":{"message":"ok"}}), None).shape, AIResponseShape::Generic);
    }
}
