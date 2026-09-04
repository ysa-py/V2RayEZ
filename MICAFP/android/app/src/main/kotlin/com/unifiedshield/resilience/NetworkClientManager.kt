package com.unifiedshield.resilience

import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

/**
 * Enterprise Network Client & Resilience Manager.
 *
 * ANTI-FABRICATION (2026-09-04): This class previously seeded four hard-coded
 * "CONNECTED" sockets and a background loop that fabricated sample RTT,
 * stability, and Rx/Tx byte counters with `Random.next*`.
 *
 * Correct behavior now:
 *   - Default telemetry is zero/`backendUnavailable=true`.
 *   - `calculateNextBackoff(...)` remains a real RFC 6298/full-jitter retry
 *     computation.
 *   - No background loop invents socket telemetry.
 *   - `recordRealSample(...)`/`recordRealSocket(...)` accept measured data only.
 *   - `triggerManualProbe(...)` never fabricates a connectivity result.
 */
class NetworkClientManager private constructor() {

    private val logger = DebugLogger.getInstance()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _telemetry = MutableStateFlow(SocketTelemetryMetrics())
    val telemetry: StateFlow<SocketTelemetryMetrics> = _telemetry.asStateFlow()

    private val _retryConfig = MutableStateFlow(RetryPolicyConfig())
    val retryConfig: StateFlow<RetryPolicyConfig> = _retryConfig.asStateFlow()

    private val _activeSockets = MutableStateFlow<List<SocketDiagnosticReport>>(emptyList())
    val activeSockets: StateFlow<List<SocketDiagnosticReport>> = _activeSockets.asStateFlow()

    private val _isBatterySaverEnabled = MutableStateFlow(false)
    val isBatterySaverEnabled: StateFlow<Boolean> = _isBatterySaverEnabled.asStateFlow()

    private var telemetryJob: Job? = null
    private val mlPredictor = com.unifiedshield.aiorchestrator.IspDpiCorrelationPredictor.getInstance()

    init {
        // No auto-start of fabricated telemetry.
    }

    fun setBatterySaverEnabled(enabled: Boolean) {
        _isBatterySaverEnabled.value = enabled
        logger.info("NetworkClient", "Socket telemetry battery saver mode set to: $enabled")
    }

    /**
     * Kept for API compatibility. Without a real socket/tap backend there is no
     * telemetry to generate, so no loop is started.
     */
    private fun startTelemetryLoop() {
        telemetryJob?.cancel()
        logger.warn("NetworkClient", "Telemetry loop requested, but no real socket/tap backend is wired in.")
    }

    /**
     * Compute exponential backoff with full jitter according to retry policy.
     */
    fun calculateNextBackoff(attempt: Int): Long {
        val config = _retryConfig.value
        val exp = 2.0.pow(attempt.toDouble())
        val calculated = config.baseBackoffMs * exp
        val bounded = min(config.maxBackoffMs.toDouble(), calculated)
        val jitterFactor = Random.nextDouble(config.jitterMultiplierMin, config.jitterMultiplierMax)
        return (bounded * jitterFactor).toLong().coerceIn(100L, config.maxBackoffMs)
    }

    /**
     * Updates smoothed RTT (SRTT) and RTTVAR according to RFC 6298, using a
     * REAL measured sample supplied by a caller. Byte counters are also supplied
     * by the caller; this function does not invent them.
     */
    fun recordRealSample(
        sampleRttMs: Double,
        bytesTransferredRxDelta: Long,
        bytesTransferredTxDelta: Long,
        packetLossPct: Double,
        lastHandshakeProtocol: String = "known transport"
    ) {
        val current = _telemetry.value
        val alpha = 0.125
        val beta = 0.25

        val newSrtt = (1 - alpha) * current.smoothedRttMs + alpha * sampleRttMs
        val newRttVar = (1 - beta) * current.rttVarianceMs + beta * abs(sampleRttMs - newSrtt)
        val calculatedTimeout = (newSrtt + 4 * newRttVar).toLong().coerceIn(150L, 2000L)
        val stability = (100 - (newRttVar * 1.5) - (packetLossPct * 10)).toInt().coerceIn(0, 100)

        _telemetry.value = SocketTelemetryMetrics(
            smoothedRttMs = Math.round(newSrtt * 10.0) / 10.0,
            rttVarianceMs = Math.round(newRttVar * 10.0) / 10.0,
            adaptiveTimeoutMs = calculatedTimeout,
            packetLossPct = Math.round(packetLossPct * 10.0) / 10.0,
            jitterMs = Math.round(newRttVar * 0.8 * 10.0) / 10.0,
            linkStabilityIndex = stability,
            bytesTransferredRx = current.bytesTransferredRx + bytesTransferredRxDelta,
            bytesTransferredTx = current.bytesTransferredTx + bytesTransferredTxDelta,
            activeSocketCount = _activeSockets.value.size,
            lastHandshakeProtocol = lastHandshakeProtocol,
            backendUnavailable = false,
            backendNote = "Real socket sample recorded."
        )

        mlPredictor.ingestTelemetrySample(
            currentRttMs = sampleRttMs.toFloat(),
            currentLossPct = packetLossPct.toFloat(),
            dpiSignatureObserved = (newRttVar > 12.0 || stability < 85),
            signatureType = if (newRttVar > 12.0) "Socket Jitter Variance Anomaly" else null
        )
    }

    /**
     * Record a real socket report from an actual transport/probe event.
     */
    fun recordRealSocket(report: SocketDiagnosticReport) {
        val list = _activeSockets.value.toMutableList()
        list.removeAll { it.socketId == report.socketId }
        list.add(report)
        _activeSockets.value = list
        _telemetry.value = _telemetry.value.copy(activeSocketCount = list.size, backendUnavailable = false)
    }

    /**
     * Manual probe request. No real probe backend is wired, so the report is
     * not fabricated; it is marked unavailable.
     */
    fun triggerManualProbe(socketId: String) {
        scope.launch {
            logger.warn("Resilience", "Manual probe for $socketId requested, but no real probe backend is wired in.")
            val report = SocketDiagnosticReport(
                socketId = socketId,
                targetHost = "unknown",
                port = 0,
                security = NetworkTransportSecurity.ENCRYPTED_TCP_RAW,
                connectionState = "UNAVAILABLE",
                latencyMs = 0,
                currentRetryAttempt = 0,
                nextBackoffMs = 0,
                backendUnavailable = true,
                backendNote = "Manual probe requested but no real probe backend is wired in."
            )
            recordRealSocket(report)
        }
    }

    fun updateRetryPolicy(baseMs: Long, maxMs: Long, maxRetries: Int) {
        _retryConfig.value = _retryConfig.value.copy(
            baseBackoffMs = baseMs,
            maxBackoffMs = maxMs,
            maxRetries = maxRetries
        )
        logger.info("Resilience", "Retry policy updated: base=${baseMs}ms, max=${maxMs}ms, retries=$maxRetries")
    }

    companion object {
        @Volatile
        private var INSTANCE: NetworkClientManager? = null

        fun getInstance(): NetworkClientManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: NetworkClientManager().also { INSTANCE = it }
            }
        }
    }
}
