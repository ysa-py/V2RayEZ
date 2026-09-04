package com.unifiedshield.resilience

data class SocketTelemetryMetrics(
    val smoothedRttMs: Double = 0.0,
    val rttVarianceMs: Double = 0.0,
    val adaptiveTimeoutMs: Long = 0,
    val packetLossPct: Double = 0.0,
    val jitterMs: Double = 0.0,
    val linkStabilityIndex: Int = 0, // 0-100%
    val bytesTransferredRx: Long = 0L,
    val bytesTransferredTx: Long = 0L,
    val activeSocketCount: Int = 0,
    val lastHandshakeProtocol: String = "unconfigured",
    val backendUnavailable: Boolean = true,
    val backendNote: String = "No real socket/transport telemetry backend is wired in; metrics are unavailable."
)

enum class NetworkTransportSecurity(val label: String, val rfcStandard: String) {
    TLS_1_3("TLS 1.3 Encrypted Socket", "RFC 8446 / ChaCha20-Poly1305"),
    QUIC_HTTP3("QUIC / HTTP/3 Datagram", "RFC 9000 / BBR Congestion Control"),
    DOH_RFC8484("DNS-over-HTTPS (DoH)", "RFC 8484 / Wireformat Wireguard-Safe"),
    DOT_RFC7858("DNS-over-TLS (DoT)", "RFC 7858 / Port 853 Strict SNI"),
    ENCRYPTED_TCP_RAW("TCP Stream with Dynamic Padding", "RFC 793 + Chaffing & Window Shaping")
}

data class RetryPolicyConfig(
    val baseBackoffMs: Long = 500L,
    val maxBackoffMs: Long = 8000L,
    val maxRetries: Int = 5,
    val jitterMultiplierMin: Double = 0.6,
    val jitterMultiplierMax: Double = 1.4,
    val isExponentialEnabled: Boolean = true
)

data class SocketDiagnosticReport(
    val socketId: String,
    val targetHost: String,
    val port: Int,
    val security: NetworkTransportSecurity,
    val connectionState: String, // CONNECTED, PROBING, RECONNECTING, IDLE
    val latencyMs: Long,
    val currentRetryAttempt: Int,
    val nextBackoffMs: Long,
    val backendUnavailable: Boolean = true,
    val backendNote: String = "No real socket probe has reported this report."
)
