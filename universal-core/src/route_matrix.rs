//! Shared route-matrix scoring model for V2RayEZ Universal.
//!
//! Platform shells still perform the real probes with their local VPN/runtime APIs, but candidate
//! generation, phase naming, A/B/B/A final ordering, and score semantics live here so Android,
//! desktop, iOS, Linux, OpenWrt, and browser shells can converge on one core contract.

use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RouteMatrixPhase {
    Idle,
    Qualification,
    Stability,
    Stress,
    FinalAbba,
    Done,
    Error,
}

impl RouteMatrixPhase {
    pub fn confidence_weight(self) -> f64 {
        match self {
            RouteMatrixPhase::Idle => 0.0,
            RouteMatrixPhase::Qualification => 0.20,
            RouteMatrixPhase::Stability => 0.45,
            RouteMatrixPhase::Stress => 0.75,
            RouteMatrixPhase::FinalAbba | RouteMatrixPhase::Done => 1.0,
            RouteMatrixPhase::Error => 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RouteDnsPreset {
    CloudflareAliyun,
    Quad9Aliyun,
    AdGuardAliyun,
    AliyunOnly,
    FakeDns,
}

impl RouteDnsPreset {
    pub const ALL: [Self; 5] = [
        Self::CloudflareAliyun,
        Self::Quad9Aliyun,
        Self::AdGuardAliyun,
        Self::AliyunOnly,
        Self::FakeDns,
    ];

    pub fn key(self) -> &'static str {
        match self {
            Self::CloudflareAliyun => "cloudflare-aliyun",
            Self::Quad9Aliyun => "quad9-aliyun",
            Self::AdGuardAliyun => "adguard-aliyun",
            Self::AliyunOnly => "aliyun-only",
            Self::FakeDns => "fake-dns",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::CloudflareAliyun => "Cloudflare + AliDNS",
            Self::Quad9Aliyun => "Quad9 + AliDNS",
            Self::AdGuardAliyun => "AdGuard + AliDNS",
            Self::AliyunOnly => "AliDNS only",
            Self::FakeDns => "FakeDNS guarded",
        }
    }

    pub fn upstreams(self) -> &'static [&'static str] {
        match self {
            Self::CloudflareAliyun => &["1.1.1.1", "1.0.0.1", "223.5.5.5"],
            Self::Quad9Aliyun => &["9.9.9.9", "149.112.112.112", "223.5.5.5"],
            Self::AdGuardAliyun => &["94.140.14.14", "94.140.15.15", "223.5.5.5"],
            Self::AliyunOnly => &["223.5.5.5", "223.6.6.6"],
            Self::FakeDns => &["1.1.1.1", "223.5.5.5"],
        }
    }

    pub fn fake_dns_enabled(self) -> bool {
        matches!(self, Self::FakeDns)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RouteFragmentPreset {
    Off,
    Fast,
    Balanced,
    Stealth,
}

impl RouteFragmentPreset {
    pub const ALL: [Self; 4] = [Self::Off, Self::Fast, Self::Balanced, Self::Stealth];

    pub fn key(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Fast => "fast-64-128",
            Self::Balanced => "balanced-100-200",
            Self::Stealth => "stealth-256-512",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Off => "Off",
            Self::Fast => "Fast 64–128B",
            Self::Balanced => "Balanced 100–200B",
            Self::Stealth => "Stealth 256–512B",
        }
    }

    pub fn byte_range(self) -> Option<(u16, u16)> {
        match self {
            Self::Off => None,
            Self::Fast => Some((64, 128)),
            Self::Balanced => Some((100, 200)),
            Self::Stealth => Some((256, 512)),
        }
    }
}

pub const ROUTE_MATRIX_MTU_PRESETS: [u16; 4] = [1280, 1360, 1420, 1500];
pub const FINAL_ABBA_ORDER: [usize; 4] = [0, 1, 1, 0];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RouteEdge {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub favorite: bool,
    pub known_ping_ms: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RouteMatrixCandidate {
    pub key: String,
    pub edge: RouteEdge,
    pub dns: RouteDnsPreset,
    pub fragment: RouteFragmentPreset,
    pub mtu: u16,
}

impl RouteMatrixCandidate {
    pub fn new(edge: RouteEdge, dns: RouteDnsPreset, fragment: RouteFragmentPreset, mtu: u16) -> Self {
        let key = format!("{}|{}|{}|{}", edge.id, dns.key(), fragment.key(), mtu);
        Self { key, edge, dns, fragment, mtu }
    }

    pub fn label(&self) -> String {
        format!("{} · {} · {} · MTU {}", self.edge.name, self.dns.label(), self.fragment.label(), self.mtu)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RouteMatrixSettingsOverride {
    pub dns_servers: Vec<String>,
    pub fake_dns_enabled: bool,
    pub fragment_enabled: bool,
    pub fragment_min_bytes: Option<u16>,
    pub fragment_max_bytes: Option<u16>,
    pub mtu: u16,
}

impl From<&RouteMatrixCandidate> for RouteMatrixSettingsOverride {
    fn from(candidate: &RouteMatrixCandidate) -> Self {
        let (fragment_enabled, min, max) = match candidate.fragment.byte_range() {
            Some((min, max)) => (true, Some(min), Some(max)),
            None => (false, None, None),
        };
        Self {
            dns_servers: candidate.dns.upstreams().iter().map(|value| (*value).to_string()).collect(),
            fake_dns_enabled: candidate.dns.fake_dns_enabled(),
            fragment_enabled,
            fragment_min_bytes: min,
            fragment_max_bytes: max,
            mtu: candidate.mtu,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RouteProbeSample {
    pub success: bool,
    pub latency_ms: Option<u32>,
    pub throughput_mbps: Option<f64>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RouteMatrixResult {
    pub candidate: RouteMatrixCandidate,
    pub phase: RouteMatrixPhase,
    pub score: f64,
    pub confidence: f64,
    pub latency_ms: u32,
    pub jitter_ms: u32,
    pub throughput_mbps: f64,
    pub success_rate: f64,
    pub sample_count: usize,
    pub message: String,
}

impl RouteMatrixResult {
    pub fn from_samples(candidate: RouteMatrixCandidate, phase: RouteMatrixPhase, samples: &[RouteProbeSample]) -> Self {
        let sample_count = samples.len();
        let success_count = samples.iter().filter(|sample| sample.success).count();
        let success_rate = if sample_count == 0 { 0.0 } else { success_count as f64 / sample_count as f64 };
        let latencies: Vec<u32> = samples.iter().filter_map(|sample| sample.latency_ms).filter(|value| *value > 0).collect();
        let latency_ms = average_u32(&latencies).unwrap_or(0);
        let jitter_ms = jitter_range(&latencies);
        let throughput_mbps = average_f64(
            samples
                .iter()
                .filter_map(|sample| sample.throughput_mbps)
                .filter(|value| *value > 0.0)
                .collect::<Vec<_>>()
                .as_slice(),
        )
        .unwrap_or(0.0);
        let confidence = confidence_for(phase, sample_count, success_rate);
        let score = route_matrix_score(latency_ms, jitter_ms, throughput_mbps, success_rate, confidence);
        let message = samples.iter().rev().find(|sample| !sample.message.is_empty()).map(|sample| sample.message.clone()).unwrap_or_default();
        Self { candidate, phase, score, confidence, latency_ms, jitter_ms, throughput_mbps, success_rate, sample_count, message }
    }
}

pub fn build_route_matrix(edges: &[RouteEdge], max_edges: usize) -> Vec<RouteMatrixCandidate> {
    let mut chosen = edges.to_vec();
    chosen.sort_by(|a, b| {
        b.favorite
            .cmp(&a.favorite)
            .then_with(|| a.known_ping_ms.unwrap_or(u32::MAX).cmp(&b.known_ping_ms.unwrap_or(u32::MAX)))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.id.cmp(&b.id))
    });
    chosen
        .into_iter()
        .take(max_edges.max(1))
        .flat_map(|edge| {
            RouteDnsPreset::ALL.into_iter().flat_map({
                let edge = edge.clone();
                move |dns| {
                    RouteFragmentPreset::ALL.into_iter().flat_map({
                        let edge = edge.clone();
                        move |fragment| {
                            ROUTE_MATRIX_MTU_PRESETS.into_iter().map({
                                let edge = edge.clone();
                                move |mtu| RouteMatrixCandidate::new(edge.clone(), dns, fragment, mtu)
                            })
                        }
                    })
                }
            })
        })
        .collect()
}

pub fn route_matrix_score(latency_ms: u32, jitter_ms: u32, throughput_mbps: f64, success_rate: f64, confidence: f64) -> f64 {
    let latency_score = if latency_ms > 0 { 2000.0 / latency_ms as f64 } else { 0.0 };
    let jitter_score = if jitter_ms > 0 { 400.0 / jitter_ms as f64 } else { 100.0 };
    let throughput_score = throughput_mbps.clamp(0.0, 50.0);
    success_rate.clamp(0.0, 1.0) * 450.0
        + latency_score * 90.0
        + jitter_score * 70.0
        + throughput_score * 18.0
        + confidence.clamp(0.0, 1.0) * 120.0
}

pub fn confidence_for(phase: RouteMatrixPhase, sample_count: usize, success_rate: f64) -> f64 {
    let samples = (sample_count as f64 / 6.0).min(1.0);
    let success = success_rate.clamp(0.0, 1.0);
    (phase.confidence_weight() * 0.45 + samples * 0.35 + success * 0.20).clamp(0.0, 1.0)
}

pub fn select_winner(results: &[RouteMatrixResult]) -> Option<RouteMatrixResult> {
    let mut successful: Vec<RouteMatrixResult> = results.iter().filter(|result| result.success_rate > 0.0).cloned().collect();
    successful.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| a.latency_ms.cmp(&b.latency_ms))
            .then_with(|| a.jitter_ms.cmp(&b.jitter_ms))
            .then_with(|| a.candidate.key.cmp(&b.candidate.key))
    });
    successful.into_iter().next()
}

pub fn final_abba_candidates(top_two: &[RouteMatrixResult]) -> Vec<RouteMatrixCandidate> {
    if top_two.is_empty() {
        return Vec::new();
    }
    FINAL_ABBA_ORDER
        .iter()
        .filter_map(|index| top_two.get(*index).or_else(|| top_two.first()))
        .map(|result| result.candidate.clone())
        .collect()
}

fn average_u32(values: &[u32]) -> Option<u32> {
    if values.is_empty() { return None; }
    Some(((values.iter().map(|value| *value as u64).sum::<u64>() as f64) / values.len() as f64).round() as u32)
}

fn average_f64(values: &[f64]) -> Option<f64> {
    if values.is_empty() { return None; }
    Some(values.iter().sum::<f64>() / values.len() as f64)
}

fn jitter_range(values: &[u32]) -> u32 {
    if values.len() < 2 { return 0; }
    let min = *values.iter().min().unwrap_or(&0);
    let max = *values.iter().max().unwrap_or(&0);
    max.saturating_sub(min)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn edge(id: &str, favorite: bool, ping: Option<u32>) -> RouteEdge {
        RouteEdge { id: id.to_string(), name: id.to_string(), protocol: "VLESS".to_string(), favorite, known_ping_ms: ping }
    }

    #[test]
    fn builds_full_bounded_matrix() {
        let candidates = build_route_matrix(&[edge("b", false, Some(200)), edge("a", true, None)], 1);
        assert_eq!(candidates.len(), RouteDnsPreset::ALL.len() * RouteFragmentPreset::ALL.len() * ROUTE_MATRIX_MTU_PRESETS.len());
        assert!(candidates.iter().all(|candidate| candidate.edge.id == "a"));
        assert!(candidates.iter().any(|candidate| candidate.key.ends_with("fake-dns|stealth-256-512|1500")));
    }

    #[test]
    fn scores_and_selects_successful_low_latency_candidate() {
        let fast = RouteMatrixCandidate::new(edge("fast", true, Some(80)), RouteDnsPreset::CloudflareAliyun, RouteFragmentPreset::Fast, 1360);
        let slow = RouteMatrixCandidate::new(edge("slow", false, Some(900)), RouteDnsPreset::AliyunOnly, RouteFragmentPreset::Off, 1500);
        let fast_result = RouteMatrixResult::from_samples(
            fast,
            RouteMatrixPhase::FinalAbba,
            &[
                RouteProbeSample { success: true, latency_ms: Some(80), throughput_mbps: Some(12.0), message: String::new() },
                RouteProbeSample { success: true, latency_ms: Some(88), throughput_mbps: Some(11.0), message: String::new() },
            ],
        );
        let slow_result = RouteMatrixResult::from_samples(
            slow,
            RouteMatrixPhase::FinalAbba,
            &[RouteProbeSample { success: true, latency_ms: Some(900), throughput_mbps: Some(0.5), message: "slow".to_string() }],
        );
        assert_eq!(select_winner(&[slow_result, fast_result]).unwrap().candidate.edge.id, "fast");
    }

    #[test]
    fn final_order_is_abba() {
        let first = RouteMatrixResult::from_samples(
            RouteMatrixCandidate::new(edge("a", true, Some(50)), RouteDnsPreset::Quad9Aliyun, RouteFragmentPreset::Balanced, 1280),
            RouteMatrixPhase::Stress,
            &[RouteProbeSample { success: true, latency_ms: Some(50), throughput_mbps: Some(1.0), message: String::new() }],
        );
        let second = RouteMatrixResult::from_samples(
            RouteMatrixCandidate::new(edge("b", false, Some(60)), RouteDnsPreset::CloudflareAliyun, RouteFragmentPreset::Fast, 1360),
            RouteMatrixPhase::Stress,
            &[RouteProbeSample { success: true, latency_ms: Some(60), throughput_mbps: Some(1.0), message: String::new() }],
        );
        let order = final_abba_candidates(&[first, second]);
        assert_eq!(order.iter().map(|candidate| candidate.edge.id.as_str()).collect::<Vec<_>>(), vec!["a", "b", "b", "a"]);
    }
}
