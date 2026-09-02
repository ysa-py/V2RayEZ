use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;
use url::Url;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("unsupported or missing proxy URI scheme")]
    UnsupportedScheme,
    #[error("invalid URI: {0}")]
    InvalidUri(String),
    #[error("invalid base64 payload")]
    InvalidBase64,
    #[error("invalid numeric port")]
    InvalidPort,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProxyProtocol {
    Vless,
    Vmess,
    Trojan,
    Shadowsocks,
    Socks5,
    WireGuard,
    AmneziaWG,
    Hysteria2,
    TuicV5,
    ShadowTls,
    NaiveProxy,
    Tor,
    Psiphon,
    MasterDnsVpn,
    Unknown(String),
}

impl ProxyProtocol {
    pub fn from_scheme(scheme: &str) -> Self {
        match scheme.to_ascii_lowercase().as_str() {
            "vless" => Self::Vless,
            "vmess" => Self::Vmess,
            "trojan" => Self::Trojan,
            "ss" | "shadowsocks" => Self::Shadowsocks,
            "socks" | "socks5" => Self::Socks5,
            "wireguard" | "wg" => Self::WireGuard,
            "amneziawg" | "awg" => Self::AmneziaWG,
            "hysteria2" | "hy2" => Self::Hysteria2,
            "tuic" | "tuic5" | "tuicv5" => Self::TuicV5,
            "shadowtls" | "shadowtls3" => Self::ShadowTls,
            "naive" | "naiveproxy" => Self::NaiveProxy,
            "tor" => Self::Tor,
            "psiphon" => Self::Psiphon,
            "masterdns" | "masterdnsvpn" | "dns-tunnel" => Self::MasterDnsVpn,
            other => Self::Unknown(other.to_string()),
        }
    }

    pub fn scheme(&self) -> &str {
        match self {
            Self::Vless => "vless",
            Self::Vmess => "vmess",
            Self::Trojan => "trojan",
            Self::Shadowsocks => "ss",
            Self::Socks5 => "socks5",
            Self::WireGuard => "wireguard",
            Self::AmneziaWG => "amneziawg",
            Self::Hysteria2 => "hysteria2",
            Self::TuicV5 => "tuicv5",
            Self::ShadowTls => "shadowtls",
            Self::NaiveProxy => "naiveproxy",
            Self::Tor => "tor",
            Self::Psiphon => "psiphon",
            Self::MasterDnsVpn => "masterdnsvpn",
            Self::Unknown(value) => value.as_str(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProxyProfile {
    pub protocol: ProxyProtocol,
    pub name: String,
    pub address: String,
    pub port: u16,
    pub user_id_or_password: Option<String>,
    pub cipher: Option<String>,
    pub security: BTreeMap<String, String>,
    pub transport: BTreeMap<String, String>,
    pub extras: BTreeMap<String, String>,
    pub original_uri: Option<String>,
}

impl ProxyProfile {
    pub fn parse_share_uri(input: &str) -> Result<Self, ConfigError> {
        let trimmed = input.trim();
        let scheme = trimmed.split_once("://").map(|(scheme, _)| scheme).ok_or(ConfigError::UnsupportedScheme)?;
        if scheme.eq_ignore_ascii_case("vmess") {
            return parse_vmess(trimmed);
        }
        if scheme.eq_ignore_ascii_case("ss") {
            if let Ok(profile) = parse_ss(trimmed) {
                return Ok(profile);
            }
        }
        let url = Url::parse(trimmed).map_err(|e| ConfigError::InvalidUri(e.to_string()))?;
        let protocol = ProxyProtocol::from_scheme(url.scheme());
        let address = url.host_str().unwrap_or_default().to_string();
        if address.is_empty() {
            return Err(ConfigError::InvalidUri("host is required".to_string()));
        }
        let port = url.port().ok_or(ConfigError::InvalidPort)?;
        let mut security = BTreeMap::new();
        let mut transport = BTreeMap::new();
        let mut extras = BTreeMap::new();
        for (key, value) in url.query_pairs() {
            let key = key.to_string();
            let value = value.to_string();
            match key.as_str() {
                "security" | "sni" | "fp" | "fingerprint" | "alpn" | "pbk" | "sid" | "spx" | "flow" => {
                    security.insert(key, value);
                }
                "type" | "host" | "path" | "serviceName" | "headerType" | "mode" | "authority" => {
                    transport.insert(key, value);
                }
                _ => {
                    extras.insert(key, value);
                }
            }
        }
        let name = url.fragment().unwrap_or_default().to_string();
        let user_id_or_password = if url.username().is_empty() { None } else { Some(urlencoding_percent_decode(url.username())) };
        Ok(Self { protocol, name, address, port, user_id_or_password, cipher: None, security, transport, extras, original_uri: Some(trimmed.to_string()) })
    }

    pub fn fingerprint_tuple(&self) -> BTreeMap<String, String> {
        let mut out = BTreeMap::new();
        for key in ["sni", "host", "path", "alpn", "fp", "fingerprint", "security", "type"] {
            if let Some(value) = self.security.get(key).or_else(|| self.transport.get(key)).or_else(|| self.extras.get(key)) {
                out.insert(key.to_string(), value.clone());
            }
        }
        out
    }
}

fn parse_vmess(input: &str) -> Result<ProxyProfile, ConfigError> {
    use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
    use base64::Engine;
    let payload = input.strip_prefix("vmess://").ok_or(ConfigError::UnsupportedScheme)?;
    let decoded = URL_SAFE_NO_PAD.decode(payload).or_else(|_| STANDARD.decode(payload)).map_err(|_| ConfigError::InvalidBase64)?;
    let json: serde_json::Value = serde_json::from_slice(&decoded).map_err(|e| ConfigError::InvalidUri(e.to_string()))?;
    let address = json.get("add").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let port = json.get("port").and_then(|v| v.as_str()).and_then(|p| p.parse::<u16>().ok()).or_else(|| json.get("port").and_then(|v| v.as_u64()).map(|p| p as u16)).ok_or(ConfigError::InvalidPort)?;
    let mut security = BTreeMap::new();
    let mut transport = BTreeMap::new();
    for key in ["tls", "sni", "alpn", "fp", "fingerprint"] {
        if let Some(value) = json.get(key).and_then(|v| v.as_str()) { security.insert(key.to_string(), value.to_string()); }
    }
    for key in ["net", "type", "host", "path", "headerType"] {
        if let Some(value) = json.get(key).and_then(|v| v.as_str()) { transport.insert(key.to_string(), value.to_string()); }
    }
    Ok(ProxyProfile {
        protocol: ProxyProtocol::Vmess,
        name: json.get("ps").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        address,
        port,
        user_id_or_password: json.get("id").and_then(|v| v.as_str()).map(ToOwned::to_owned),
        cipher: json.get("scy").and_then(|v| v.as_str()).map(ToOwned::to_owned),
        security,
        transport,
        extras: BTreeMap::new(),
        original_uri: Some(input.to_string()),
    })
}

fn parse_ss(input: &str) -> Result<ProxyProfile, ConfigError> {
    let url = Url::parse(input).map_err(|e| ConfigError::InvalidUri(e.to_string()))?;
    let address = url.host_str().unwrap_or_default().to_string();
    let port = url.port().ok_or(ConfigError::InvalidPort)?;
    let userinfo = urlencoding_percent_decode(url.username());
    let (cipher, password) = userinfo.split_once(':').map(|(c, p)| (Some(c.to_string()), Some(p.to_string()))).unwrap_or((None, if userinfo.is_empty() { None } else { Some(userinfo) }));
    Ok(ProxyProfile { protocol: ProxyProtocol::Shadowsocks, name: url.fragment().unwrap_or_default().to_string(), address, port, user_id_or_password: password, cipher, security: BTreeMap::new(), transport: BTreeMap::new(), extras: BTreeMap::new(), original_uri: Some(input.to_string()) })
}

fn urlencoding_percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vless_preserves_sni_host_path_alpn_fingerprint() {
        let profile = ProxyProfile::parse_share_uri("vless://uuid@example.com:443?security=reality&sni=front.example&fp=chrome&alpn=h2,http/1.1&type=ws&host=origin.example&path=%2Fws#demo").unwrap();
        let tuple = profile.fingerprint_tuple();
        assert_eq!(tuple.get("sni").unwrap(), "front.example");
        assert_eq!(tuple.get("host").unwrap(), "origin.example");
        assert_eq!(tuple.get("path").unwrap(), "/ws");
        assert_eq!(tuple.get("fp").unwrap(), "chrome");
    }
}
