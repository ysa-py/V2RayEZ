//! Smart Iran anti-censorship / anti-DPI / dynamic-domain decision engine.
//!
//! This module is the *shared, dependency-free* brain for the V2RayEZ Universal
//! core. It deliberately contains **no networking** — platform shells (Android
//! JNI, iOS, Windows/Linux, OpenWrt) probe the network, then ask this engine:
//!
//! ```text
//!   network/carrier/blocked-signals  ──▶  SmartRouteDecision  ──▶  runtime config
//! ```
//!
//! It is pure logic over `std` + `serde`, so it is unit-testable on any host
//! (cargo test) and cannot break the FFI/JNI status contract. No feature, native
//! library, or existing FFI symbol is removed — this is purely additive.

use serde::{Deserialize, Serialize};

/// Iranian mobile/ISP carriers with known peering & DPI characteristics.
/// Order matters: it is also used as a coarse "is this Iran-relevant?" hint.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum IranCarrier {
    /// MCI / Hamrahe Aval (first mobile operator)
    Mci,
    /// Irancell
    Irancell,
    /// Rightel
    Rightel,
    /// TCI (fixed / ADSL / FTTH)
    Tci,
    /// Other Iranian ISP (e.g. Shatel, Asiatech, Afranet, ParsOnline)
    OtherIsp,
    /// Non-Iranian (e.g. roaming or a non-IR SIM), or unknown.
    NonIran,
}

impl IranCarrier {
    pub const ALL: [Self; 5] = [
        Self::Mci,
        Self::Irancell,
        Self::Rightel,
        Self::Tci,
        Self::OtherIsp,
    ];

    pub fn from_name(name: &str) -> Self {
        let n = name.to_ascii_lowercase();
        if n.contains("hamrahe") || n.contains("mci") {
            Self::Mci
        } else if n.contains("mtn") || n.contains("irancell") {
            Self::Irancell
        } else if n.contains("rightel") {
            Self::Rightel
        } else if n.contains("tci") || n.contains("telecommunication") || n.contains("shatel")
            || n.contains("asiatech") || n.contains("afranet")
        {
            Self::Tci
        } else if n.is_empty() {
            Self::NonIran
        } else {
            Self::OtherIsp
        }
    }

    pub fn key(self) -> &'static str {
        match self {
            Self::Mci => "mci",
            Self::Irancell => "irancell",
            Self::Rightel => "rightel",
            Self::Tci => "tci",
            Self::OtherIsp => "other-isp",
            Self::NonIran => "non-iran",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Mci => "MCI / Hamrahe Aval",
            Self::Irancell => "Irancell (MTN)",
            Self::Rightel => "Rightel",
            Self::Tci => "TCI / Fixed",
            Self::OtherIsp => "Other Iranian ISP",
            Self::NonIran => "Non-Iranian / Unknown",
        }
    }

    /// True when the carrier is an Iranian mobile or fixed operator.
    pub fn is_iran(self) -> bool {
        !matches!(self, Self::NonIran)
    }
}

/// Observed network signals that feed the anti-DPI decision. All are optional
/// so an engine shell can fill in whatever it managed to probe.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct DpiSignals {
    /// True when plain TLS to the transport port fails/times out (classic GFW/DPI
    /// RST pattern).
    pub tls_plain_blocked: bool,
    /// True when connections are reset but UDP/TCP sniffed packets still arrive.
    pub reset_before_tls: bool,
    /// True when SNI-based blocking is observed (RST after ClientHello SNI).
    pub sni_blocked: bool,
    /// True when the carrier caps or throttles long-lived tunnels.
    pub throttling: bool,
    /// True when TRACE/HTTP CONNECT probes are intercepted.
    pub http_proxy_blocked: bool,
    /// Number of consecutive failed handshakes (used as a confidence signal).
    pub consecutive_failures: u32,
    /// Observed RTT in ms (0 = unknown).
    pub rtt_ms: u32,
    /// Observed jitter in ms (0 = unknown).
    pub jitter_ms: u32,
}

impl DpiSignals {
    /// Confidence (0.0–1.0) that the observed signals are real, i.e. that we
    /// actually probed a blocked link rather than guessing. Absence of signals
    /// is NOT treated as reassurance.
    pub fn confidence(&self) -> f64 {
        let mut hits: f64 = 0.0;
        if self.tls_plain_blocked {
            hits += 1.0;
        }
        if self.reset_before_tls {
            hits += 1.0;
        }
        if self.sni_blocked {
            hits += 1.0;
        }
        if self.throttling {
            hits += 1.0;
        }
        if self.http_proxy_blocked {
            hits += 1.0;
        }
        let failures = (self.consecutive_failures.min(4) as f64) / 4.0;
        (hits / 5.0 * 0.7 + failures * 0.3).clamp(0.0, 1.0)
    }

    /// Aggregate "is the link actually hostile?" scalar in [0.0, 1.0].
    pub fn blocked_score(&self) -> f64 {
        let mut s: f64 = 0.0;
        if self.tls_plain_blocked {
            s += 0.30;
        }
        if self.reset_before_tls {
            s += 0.25;
        }
        if self.sni_blocked {
            s += 0.20;
        }
        if self.http_proxy_blocked {
            s += 0.15;
        }
        if self.throttling {
            s += 0.10;
        }
        (s + (self.consecutive_failures.min(5) as f64) * 0.04).clamp(0.0, 1.0)
    }
}

/// Candidate obfuscation / evasion profiles an engine can activate.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum EvasionProfile {
    /// No extra evasion (clean/open route).
    Direct,
    /// uTLS Chrome-like fingerprint on the transport.
    UtlsChrome,
    /// TCP segmentation / TLS record fragmentation (desync).
    TlsFrag,
    /// Domain-fronting / SNI-rotation via a reachable front.
    DomainFront,
    /// Full tls-in-tls + padding + fragment combo (heaviest, best on hard DPI).
    Stealth,
    /// QUIC-based (Hysteria2 / TUIC) — good when UDP is not throttled.
    Quic,
    /// Pluggable transport (obfs4 / Lyrebird / WebTunnel / Snowflake).
    Pluggable,
}

impl EvasionProfile {
    pub fn key(self) -> &'static str {
        match self {
            Self::Direct => "direct",
            Self::UtlsChrome => "utls-chrome",
            Self::TlsFrag => "tls-frag",
            Self::DomainFront => "domain-front",
            Self::Stealth => "stealth",
            Self::Quic => "quic",
            Self::Pluggable => "pluggable",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Direct => "Direct",
            Self::UtlsChrome => "uTLS Chrome fingerprint",
            Self::TlsFrag => "TLS record fragmentation",
            Self::DomainFront => "Domain fronting / SNI rotation",
            Self::Stealth => "Stealth (tls-in-tls + padding)",
            Self::Quic => "QUIC (Hysteria2 / TUIC)",
            Self::Pluggable => "Pluggable transport (obfs4/WebTunnel)",
        }
    }

    /// Rough "cost" in latency/CPU/size to select the lightest route first.
    pub fn cost(self) -> u8 {
        match self {
            Self::Direct => 0,
            Self::Quic => 1,
            Self::UtlsChrome => 2,
            Self::TlsFrag => 3,
            Self::Pluggable => 4,
            Self::DomainFront => 5,
            Self::Stealth => 6,
        }
    }
}

/// Anti-DPI recommendation for one edge (server/protocol), to be applied by the
/// platform shell then measured by the route-matrix.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AntiDpiRecommendation {
    pub profile: EvasionProfile,
    pub front_domain: Option<String>,
    pub tls_fragment_bytes: Option<(u16, u16)>,
    pub padding_hello: bool,
    pub reason: String,
    pub confidence: f64,
}

/// Dynamic, Iran-reachable front/CDN domain. This is the "dynamic domain" part:
/// the engine keeps a live set of fronts that are known-reachable in Iran and
/// rotates to the next candidate on failure, with an age/health heuristic.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DynamicFront {
    pub domain: String,
    /// 0.0–1.0 health score (updated from probe outcomes).
    pub health: f64,
    /// Coarse preference based on known Iran peering (Cloudflare, ArvanCloud,
    /// Derak, etc. are listed high; barely-used CDNs are penalised).
    pub preference: u8,
}

impl DynamicFront {
    pub fn iran_default() -> Vec<Self> {
        vec![
            Self { domain: "arvancloud.ir".to_string(), health: 0.72, preference: 5 },
            Self { domain: "cdn.cloudflare.net".to_string(), health: 0.78, preference: 5 },
            Self { domain: "derak.cloud".to_string(), health: 0.60, preference: 4 },
            Self { domain: "cdn.jsdelivr.net".to_string(), health: 0.60, preference: 4 },
            Self { domain: "speedtest.irc.ir".to_string(), health: 0.55, preference: 3 },
            Self { domain: "proxy.front.example".to_string(), health: 0.50, preference: 2 },
        ]
    }
}

/// The full, serialisable decision an engine shell applies.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SmartRouteDecision {
    pub carrier: IranCarrier,
    pub blocked_score: f64,
    pub confidence: f64,
    pub profile: EvasionProfile,
    pub recommendation: AntiDpiRecommendation,
    /// Ordered dynamic front rotation list (best-first) for domain fronting.
    pub front_rotation: Vec<DynamicFront>,
    /// Whether the decision was reached by a real signal (confidence high) or a
    /// conservative default (confidence low -> prefer Direct/light evasion).
    pub heuristic: String,
}

impl SmartRouteDecision {
    /// Build a decision purely from observed signals. Never panics, always
    /// returns a usable (if conservative) profile.
    pub fn decide(carrier: IranCarrier, signals: &DpiSignals, fronts: &[DynamicFront]) -> Self {
        let confidence = signals.confidence();
        let blocked_score = signals.blocked_score();

        // Escalation ladder (checked top-down, first match wins):
        //   1. Throttling  -> Pluggable transport (hardest to identify/throttle)
        //   2. blocked >= 0.65 -> Stealth (tls-in-tls + padding + fragments)
        //   3. SNI/RST blocking -> DomainFront (rotate SNI/front domain)
        //   4. blocked >= 0.45 -> TlsFrag (record fragmentation)
        //   5. blocked >= 0.25 -> UtlsChrome (subtle uTLS fingerprint)
        //   6. else             -> Direct (clean / open route)
        let profile = if signals.throttling {
            EvasionProfile::Pluggable
        } else if blocked_score >= 0.65 {
            EvasionProfile::Stealth
        } else if signals.sni_blocked || signals.reset_before_tls {
            EvasionProfile::DomainFront
        } else if blocked_score >= 0.45 {
            EvasionProfile::TlsFrag
        } else if blocked_score >= 0.25 {
            EvasionProfile::UtlsChrome
        } else {
            EvasionProfile::Direct
        };

        // Fragment sizing: lighter for fast, heavier for stealth.
        let tls_fragment_bytes = match profile {
            EvasionProfile::TlsFrag => Some((100, 200)),
            EvasionProfile::Stealth => Some((256, 512)),
            _ => None,
        };
        let padding_hello = matches!(profile, EvasionProfile::Stealth | EvasionProfile::Pluggable);

        // Dynamic front rotation: health + preference, best-first; fall back to
        // Iran defaults if none supplied.
        let mut rotation: Vec<DynamicFront> = if fronts.is_empty() {
            DynamicFront::iran_default()
        } else {
            fronts.to_vec()
        };
        rotation.sort_by(|a, b| {
            (b.health * 0.6 + b.preference as f64 * 0.4)
                .partial_cmp(&(a.health * 0.6 + a.preference as f64 * 0.4))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.domain.cmp(&b.domain))
        });

        let front_domain = match profile {
            EvasionProfile::DomainFront | EvasionProfile::Stealth => {
                rotation.first().map(|f| f.domain.clone())
            }
            _ => None,
        };

        let reason = build_reason(carrier, blocked_score, confidence, profile);

        let heuristic = format!(
            "carrier={} blocked={:.2} confidence={:.2} profile={}",
            carrier.key(),
            blocked_score,
            confidence,
            profile.key()
        );

        let recommendation = AntiDpiRecommendation {
            profile,
            front_domain,
            tls_fragment_bytes,
            padding_hello,
            reason,
            confidence,
        };

        Self {
            carrier,
            blocked_score,
            confidence,
            profile,
            recommendation,
            front_rotation: rotation,
            heuristic,
        }
    }
}

fn build_reason(
    carrier: IranCarrier,
    blocked_score: f64,
    confidence: f64,
    profile: EvasionProfile,
) -> String {
    if profile == EvasionProfile::Direct {
        return format!(
            "{}: link appears clean (blocked={:.2}); using direct route.",
            carrier.label(),
            blocked_score
        );
    }
    format!(
        "{}: anti-DPI escalation to {} (blocked={:.2}, confidence={:.2}).",
        carrier.label(),
        profile.label(),
        blocked_score,
        confidence
    )
}

/// A tiny, dependency-free tie-breaker for two front candidates (used for
/// rotation tests); kept public so shells can reuse the same ordering.
pub fn front_rank(f: &DynamicFront) -> f64 {
    f.health * 0.6 + f.preference as f64 * 0.4
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_link_prefers_direct() {
        let d = SmartRouteDecision::decide(IranCarrier::Tci, &DpiSignals::default(), &[]);
        assert_eq!(d.profile, EvasionProfile::Direct);
        assert_eq!(d.recommendation.profile, EvasionProfile::Direct);
        assert!(d.recommendation.front_domain.is_none());
        // Confidence must be low when nothing was actually measured.
        assert!(d.confidence < 0.5);
    }

    #[test]
    fn hard_sni_block_escalates_to_domain_front() {
        let signals = DpiSignals {
            tls_plain_blocked: true,
            sni_blocked: true,
            consecutive_failures: 3,
            ..Default::default()
        };
        let d = SmartRouteDecision::decide(IranCarrier::Irancell, &signals, &[]);
        assert_eq!(d.profile, EvasionProfile::DomainFront);
        assert!(d.recommendation.front_domain.is_some());
        assert!(d.confidence > 0.5);
    }

    #[test]
    fn throttling_escalates_to_pluggable() {
        let signals = DpiSignals {
            throttling: true,
            consecutive_failures: 4,
            ..Default::default()
        };
        let d = SmartRouteDecision::decide(IranCarrier::Mci, &signals, &[]);
        assert_eq!(d.profile, EvasionProfile::Pluggable);
        assert!(d.recommendation.padding_hello);
    }

    #[test]
    fn very_high_blocked_score_escalates_to_stealth() {
        let signals = DpiSignals {
            tls_plain_blocked: true,
            reset_before_tls: true,
            sni_blocked: true,
            http_proxy_blocked: true,
            consecutive_failures: 5,
            ..Default::default()
        };
        let d = SmartRouteDecision::decide(IranCarrier::Rightel, &signals, &[]);
        assert_eq!(d.profile, EvasionProfile::Stealth);
        assert!(d.recommendation.front_domain.is_some());
        assert_eq!(d.recommendation.tls_fragment_bytes, Some((256, 512)));
    }

    #[test]
    fn moderate_blocking_escalates_to_utls_then_frag() {
        // tls_plain_blocked only (no sni/reset/throttle) -> blocked = 0.30
        // (in [0.25, 0.45)) -> uTLS Chrome fingerprint.
        let light = SmartRouteDecision::decide(
            IranCarrier::Tci,
            &DpiSignals { tls_plain_blocked: true, ..Default::default() },
            &[],
        );
        assert_eq!(light.profile, EvasionProfile::UtlsChrome);

        // tls + http-proxy + 1 failure = 0.30 + 0.15 + 0.04 = 0.49
        // (in [0.45, 0.65)) with no sni/reset/throttle -> TLS record frag.
        let mid = SmartRouteDecision::decide(
            IranCarrier::Tci,
            &DpiSignals {
                tls_plain_blocked: true,
                http_proxy_blocked: true,
                consecutive_failures: 1,
                ..Default::default()
            },
            &[],
        );
        assert_eq!(mid.profile, EvasionProfile::TlsFrag);
        assert_eq!(mid.recommendation.tls_fragment_bytes, Some((100, 200)));
    }

    #[test]
    fn front_rotation_is_best_first() {
        let fronts = vec![
            DynamicFront { domain: "low.example".to_string(), health: 0.3, preference: 1 },
            DynamicFront { domain: "arvancloud.ir".to_string(), health: 0.9, preference: 5 },
            DynamicFront { domain: "mid.example".to_string(), health: 0.6, preference: 3 },
        ];
        let d = SmartRouteDecision::decide(
            IranCarrier::Tci,
            &DpiSignals { sni_blocked: true, ..Default::default() },
            &fronts,
        );
        assert_eq!(d.front_rotation.first().unwrap().domain, "arvancloud.ir");
        let mut ranked = fronts.clone();
        ranked.sort_by(|a, b| front_rank(b).partial_cmp(&front_rank(a)).unwrap_or(std::cmp::Ordering::Equal));
        assert_eq!(ranked.first().unwrap().domain, "arvancloud.ir");
    }

    #[test]
    fn non_iran_carrier_is_detected() {
        let c = IranCarrier::from_name("");
        assert_eq!(c, IranCarrier::NonIran);
        assert!(!c.is_iran());
        let iran = IranCarrier::from_name("MTN Irancell");
        assert_eq!(iran, IranCarrier::Irancell);
        assert!(iran.is_iran());
    }

    #[test]
    fn blocked_score_is_bounded() {
        let signals = DpiSignals {
            tls_plain_blocked: true,
            reset_before_tls: true,
            sni_blocked: true,
            http_proxy_blocked: true,
            throttling: true,
            consecutive_failures: 5,
            ..Default::default()
        };
        let s = signals.blocked_score();
        assert!(s <= 1.0);
        assert!(s > 0.9);
    }

    #[test]
    fn decision_is_serialisable_and_stable() {
        let d = SmartRouteDecision::decide(
            IranCarrier::Rightel,
            &DpiSignals { reset_before_tls: true, consecutive_failures: 2, ..Default::default() },
            &[],
        );
        let json = serde_json::to_string(&d).unwrap();
        let back: SmartRouteDecision = serde_json::from_str(&json).unwrap();
        assert_eq!(back.profile, d.profile);
        assert_eq!(back.recommendation, d.recommendation);
        assert_eq!(back.heuristic, d.heuristic);
    }
}
