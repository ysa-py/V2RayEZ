package com.unifiedshield

import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlin.math.abs

/**
 * On-Device Adaptive Heuristic (advisory only).
 *
 * ANTI-FABRICATION (2026-09-04): This class previously reported a fabricated
 * "MAXIMUM-QUANTUM" stealth score, a phantom 184-byte injection, a hard-coded
 * "Mesh-Relay-Tehran-01" relay, 1420 neutralized RST packets, and synthetic
 * entropy/confidence values generated with `Random.next*`.
 *
 * Correct behavior now:
 *   - Default state is `backendUnavailable=true` with zero/unknown telemetry.
 *   - It does NOT run an AI model, quantum engine, or packet injector.
 *   - `evaluateTrafficSignal(...)` is only a deterministic advisory heuristic
 *     over caller-supplied observations; it never fabricates sensor data and
 *     never claims a mitigation was applied.
 */
data class AiStealthState(
    val stealthScore: Double = 0.0,
    val dpiResistanceLevel: String = "UNKNOWN",
    val activeStealthProtocol: String = "unconfigured",
    val randomPaddingBytes: Int = 0,
    val tlsRecordSplitLength: Int = 0,
    val isNationalIntranetMode: Boolean = false,
    val activeRelayNode: String = "",
    val estimatedLatencyMs: Long = 0,
    val tcpRstNeutralizedCount: Long = 0,
    val adversarialNoiseEntropy: Double = 0.0,
    val ucbArmSelected: String = "not-sampled",
    val aiConfidenceRate: Double = 0.0,
    val lastDecisionTime: Long = System.currentTimeMillis(),
    val isAdaptiveModeEnabled: Boolean = false,
    val backendUnavailable: Boolean = true,
    val backendNote: String = "No real AiStealth inference/quantum/injection backend is wired in; telemetry is unavailable."
)

data class AiDecisionLog(
    val id: String = java.util.UUID.randomUUID().toString().substring(0, 8),
    val timestamp: String,
    val action: String,
    val reason: String,
    val effectiveness: Double
)

class AiStealthEngine private constructor() {

    private val TAG = "AiStealthEngine"

    private val _stealthState = MutableStateFlow(AiStealthState())
    val stealthState: StateFlow<AiStealthState> = _stealthState

    private val _decisionLogs = MutableStateFlow<List<AiDecisionLog>>(emptyList())
    val decisionLogs: StateFlow<List<AiDecisionLog>> = _decisionLogs

    // Historical observations for a lightweight heuristic (real measurements
    // supplied by callers, not synthesized here).
    private val timingHistory = ArrayList<Long>()
    private val packetSizes = ArrayList<Int>()
    private var rstPacketCount = 0L
    private var totalPacketsEvaluated = 0L

    /**
     * Deterministic advisory heuristic. It does not apply a mitigation and does
     * not generate telemetry. Returned recommendations are advisory only.
     */
    fun evaluateTrafficSignal(
        packetSize: Int,
        latencyMs: Long,
        isTcpRst: Boolean,
        handshakeDurationMs: Long,
        ispName: String
    ): AiStealthState {
        totalPacketsEvaluated++
        if (isTcpRst) rstPacketCount++

        timingHistory.add(latencyMs)
        if (timingHistory.size > 50) timingHistory.removeAt(0)

        packetSizes.add(packetSize)
        if (packetSizes.size > 50) packetSizes.removeAt(0)

        val avgLatency = timingHistory.average().takeIf { !it.isNaN() } ?: 0.0
        val latencyJitter = timingHistory.map { abs(it - avgLatency) }.average().takeIf { !it.isNaN() } ?: 0.0
        val rstRatio = if (totalPacketsEvaluated > 0) rstPacketCount.toDouble() / totalPacketsEvaluated.coerceAtLeast(1) else 0.0

        val dpiRiskIndex = (rstRatio * 2.5 + (latencyJitter / 100.0)).coerceIn(0.0, 1.0)
        val intranetHint = ispName.contains("INTRANET", ignoreCase = true)

        val recommendedSplit = when {
            dpiRiskIndex > 0.6 -> 2
            dpiRiskIndex > 0.3 -> 3
            else -> 6
        }
        // Deterministic advisory padding, not an injected byte count.
        val advisoryPadding = ((packetSize.coerceAtLeast(0) / 4) + recommendedSplit).coerceIn(0, 1024)
        val advisoryProtocol = when {
            intranetHint -> "ADVISORY: Intranet heuristic triggered (no real intranet relay configured)"
            dpiRiskIndex > 0.7 -> "ADVISORY: Aggressive heuristic recommended (no quantum backend wired)"
            dpiRiskIndex > 0.4 -> "ADVISORY: Moderate heuristic recommended"
            else -> "ADVISORY: Low-risk heuristic recommended"
        }

        val updated = _stealthState.value.copy(
            stealthScore = 0.0,
            dpiResistanceLevel = "UNKNOWN",
            activeStealthProtocol = advisoryProtocol,
            randomPaddingBytes = advisoryPadding,
            tlsRecordSplitLength = recommendedSplit,
            isNationalIntranetMode = intranetHint,
            activeRelayNode = "",
            estimatedLatencyMs = 0L,
            tcpRstNeutralizedCount = 0L,
            adversarialNoiseEntropy = 0.0,
            aiConfidenceRate = 0.0,
            lastDecisionTime = System.currentTimeMillis(),
            backendUnavailable = true,
            backendNote = "Advisory heuristic only; no mitigation applied and no sensor telemetry available."
        )

        _stealthState.value = updated
        return updated
    }

    /**
     * Advisory pulse placeholder. It creates NO noise and neutralizes NOTHING;
     * it only records that the action was requested.
     */
    fun triggerAdversarialNoisePulse(): AiStealthState {
        val current = _stealthState.value
        val updated = current.copy(
            backendUnavailable = true,
            backendNote = "Adversarial noise pulse requested but no noise-generation backend is wired in."
        )
        _stealthState.value = updated

        val timeStr = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
        val newLog = AiDecisionLog(
            timestamp = timeStr,
            action = "Adversarial Noise Pulse REQUESTED (not generated)",
            reason = "No on-device noise-generation backend is wired in",
            effectiveness = 0.0
        )
        _decisionLogs.value = listOf(newLog) + _decisionLogs.value.take(15)

        return updated
    }

    fun setTlsSplitLength(length: Int) {
        _stealthState.value = _stealthState.value.copy(tlsRecordSplitLength = length)
    }

    fun toggleAdaptiveMode(enabled: Boolean) {
        _stealthState.value = _stealthState.value.copy(isAdaptiveModeEnabled = enabled)
    }

    /**
     * Records an advisory item only. It does NOT implement TLS MSS clamping,
     * Cloudflare Turnstile pass-through, or any TLS stack change.
     */
    fun mitigateCloudflareTlsStall(host: String = "unknown"): AiStealthState {
        val current = _stealthState.value
        val timeStr = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
        val log = AiDecisionLog(
            timestamp = timeStr,
            action = "Cloudflare TLS Safeguard REQUESTED (not applied)",
            reason = "Advisory only for $host; no TLS-stack mitigation backend is wired in",
            effectiveness = 0.0
        )
        _decisionLogs.value = (listOf(log) + _decisionLogs.value).take(15)

        val updated = current.copy(
            activeStealthProtocol = "ADVISORY: Cloudflare TLS safeguard requested (not applied)",
            stealthScore = 0.0,
            lastDecisionTime = System.currentTimeMillis(),
            backendUnavailable = true,
            backendNote = "Cloudflare TLS mitigation requested but no backend is wired in."
        )
        _stealthState.value = updated
        Log.w(TAG, "Cloudflare TLS safeguard is advisory-only in this build; no mitigation applied.")
        return updated
    }

    companion object {
        @Volatile
        private var instance: AiStealthEngine? = null

        fun getInstance(): AiStealthEngine {
            return instance ?: synchronized(this) {
                instance ?: AiStealthEngine().also { instance = it }
            }
        }
    }
}
