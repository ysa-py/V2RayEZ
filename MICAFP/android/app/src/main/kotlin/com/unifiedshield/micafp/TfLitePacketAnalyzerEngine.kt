package com.unifiedshield.micafp

import android.util.Log
import com.unifiedshield.aiorchestrator.AiCoreOrchestrator
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.ln

/**
 * PROJECT MICAFP — TensorFlow Lite Real-Time Packet Entropy & Inter-Arrival Timing Inference Engine.
 *
 * ANTI-FABRICATION (2026-09-04): This class previously seeded
 * `totalEvaluatedPackets=184200`, `dpiProbingProbability=0.04`, and fabricated
 * entropy/IAT/model-inference results with `Random.nextBytes()`/`Random.nextLong()`
 * every 2.5s. No real packet window or TFLite model ran.
 *
 * Correct behavior now:
 *   - Default state is `backendUnavailable=true`, `totalEvaluatedPackets=0`, and
 *     every metric is unset/zero.
 *   - No background loop fabricates packet windows or inference results.
 *   - `calculatePayloadEntropy` remains a real Shannon-entropy utility.
 *   - `classifyPacketWindow(...)` is the explicit real-data path and is NOT called
 *     until a real packet capture/TFLite backend is wired in.
 */
class TfLitePacketAnalyzerEngine private constructor() {

    private val TAG = "TfLitePacketAnalyzer"
    private val logger = DebugLogger.getInstance()

    private val _inferenceMetrics = MutableStateFlow(
        TfLiteInferenceMetrics(
            payloadEntropyBits = 0f,
            interArrivalTimingUs = 0L,
            dpiProbingProbability = 0f,
            classifiedThreatLevel = "UNAVAILABLE",
            totalEvaluatedPackets = 0L,
            modelInferenceTimeUs = 0L,
            backendUnavailable = true,
            backendNote = "No real packet window/TFLite backend is wired in; inference telemetry is unavailable."
        )
    )
    val inferenceMetrics: StateFlow<TfLiteInferenceMetrics> = _inferenceMetrics.asStateFlow()

    /**
     * Calculates Shannon entropy of a byte array: H(X) = -sum(P(x) * log2(P(x)))
     */
    fun calculatePayloadEntropy(bytes: ByteArray): Float {
        if (bytes.isEmpty()) return 0f
        val frequency = IntArray(256)
        for (b in bytes) {
            frequency[b.toInt() and 0xFF]++
        }
        var entropy = 0.0
        val len = bytes.size.toDouble()
        for (count in frequency) {
            if (count > 0) {
                val p = count / len
                entropy -= p * (ln(p) / ln(2.0))
            }
        }
        return entropy.toFloat()
    }

    /**
     * Classify a REAL captured packet window. Intentionally not wired to a
     * background loop; a real TFLite backend must call this with measured
     * entropy and IAT values.
     */
    fun classifyPacketWindow(entropyBits: Float, interArrivalTimingUs: Long, evaluatedPackets: Long, modelInferenceTimeUs: Long) {
        val probingProb = when {
            entropyBits in 0.0001f..6.8f -> 0.70f
            interArrivalTimingUs in 1..99 -> 0.55f
            else -> 0.05f
        }
        val threatLevel = when {
            probingProb > 0.60f -> "CRITICAL_DPI_PROBE"
            probingProb > 0.40f -> "ELEVATED_PATTERN_SCAN"
            else -> "LOW_STABLE"
        }
        _inferenceMetrics.value = TfLiteInferenceMetrics(
            payloadEntropyBits = Math.round(entropyBits * 100f) / 100f,
            interArrivalTimingUs = interArrivalTimingUs,
            dpiProbingProbability = Math.round(probingProb * 100f) / 100f,
            classifiedThreatLevel = threatLevel,
            totalEvaluatedPackets = evaluatedPackets,
            modelInferenceTimeUs = modelInferenceTimeUs,
            backendUnavailable = false,
            backendNote = "Real packet-window classification accepted."
        )
    }

    companion object {
        @Volatile
        private var INSTANCE: TfLitePacketAnalyzerEngine? = null

        fun getInstance(): TfLitePacketAnalyzerEngine {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: TfLitePacketAnalyzerEngine().also { INSTANCE = it }
            }
        }
    }
}

data class TfLiteInferenceMetrics(
    val payloadEntropyBits: Float,
    val interArrivalTimingUs: Long,
    val dpiProbingProbability: Float,
    val classifiedThreatLevel: String,
    val totalEvaluatedPackets: Long,
    val modelInferenceTimeUs: Long,
    val backendUnavailable: Boolean = true,
    val backendNote: String = ""
)
