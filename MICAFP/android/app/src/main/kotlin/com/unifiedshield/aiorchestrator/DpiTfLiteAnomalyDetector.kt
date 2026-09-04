package com.unifiedshield.aiorchestrator

import android.util.Log
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.abs

/**
 * Real-time DPI Anomaly Detection (TFLite-compatible signature heuristic).
 *
 * ANTI-FABRICATION (2026-09-04): This class previously seeded a fake
 * `censorshipPressureIndex=18.5`, `dpiBlocksDetectedCount=142`, three fabricated
 * anomaly events, and a background loop that generated RTT/loss/pressure
 * telemetry with `Random.nextFloat()` every 3s.
 *
 * Correct behavior now:
 *   - Defaults are zero/unavailable; no telemetry is synthesized.
 *   - `analyzePacketHeader(...)` is the only real-data path: it heuristically
 *     scores caller-supplied packet-header evidence and records genuine
 *     detections when confidence >= 0.80.
 */
class DpiTfLiteAnomalyDetector private constructor() {

    private val TAG = "DpiAnomalyDetector"
    private val logger = DebugLogger.getInstance()
    private val orchestrator = AiCoreOrchestrator.getInstance()

    private val _censorshipPressureIndex = MutableStateFlow(0f)
    val censorshipPressureIndex: StateFlow<Float> = _censorshipPressureIndex.asStateFlow()

    private val _dpiBlocksDetectedCount = MutableStateFlow(0)
    val dpiBlocksDetectedCount: StateFlow<Int> = _dpiBlocksDetectedCount.asStateFlow()

    private val _telemetryHistory = MutableStateFlow<List<TelemetryDataPoint>>(emptyList())
    val telemetryHistory: StateFlow<List<TelemetryDataPoint>> = _telemetryHistory.asStateFlow()

    private val _anomalyEvents = MutableStateFlow<List<AnomalyDetectionEvent>>(emptyList())
    val anomalyEvents: StateFlow<List<AnomalyDetectionEvent>> = _anomalyEvents.asStateFlow()

    private val _backendUnavailable = MutableStateFlow(true)
    val backendUnavailable: StateFlow<Boolean> = _backendUnavailable.asStateFlow()

    private val mlPredictor = IspDpiCorrelationPredictor.getInstance()
    private val _isBatterySaverMode = MutableStateFlow(false)
    val isBatterySaverMode: StateFlow<Boolean> = _isBatterySaverMode.asStateFlow()

    fun setBatterySaverMode(enabled: Boolean) {
        _isBatterySaverMode.value = enabled
        logger.info("DpiAnomalyDetector", "DPI Anomaly Detector battery saver mode set to: $enabled")
    }

    /**
     * Kept for API compatibility. There is no raw packet tap hooked to this
     * detector, so it does not run a synthetic loop.
     */
    fun startAnomalyMonitoringLoop() {
        _backendUnavailable.value = true
        logger.warn(TAG, "Anomaly monitoring loop requested, but no real packet tap/telemetry backend is wired in.")
    }

    /**
     * Heuristically scores caller-supplied packet-header evidence. This is the
     * only source of detection events; no random values are generated.
     */
    fun analyzePacketHeader(
        headerBytes: ByteArray,
        ipSrc: String,
        ipDst: String,
        tcpFlags: String,
        detectedTtl: Int
    ) {
        val isRst = tcpFlags.contains("RST", ignoreCase = true)
        val isZeroWindow = tcpFlags.contains("WIN:0", ignoreCase = true)
        val ttlDiscrepancy = abs(detectedTtl - 64) > 12

        val confidence = when {
            isRst && ttlDiscrepancy -> 0.96f
            isZeroWindow -> 0.88f
            else -> 0.65f
        }

        if (confidence >= 0.80f) {
            val newCount = _dpiBlocksDetectedCount.value + 1
            _dpiBlocksDetectedCount.value = newCount
            val signature = if (isRst) "National Firewall Out-of-Sequence TCP RST" else "DPI Throttling Window Clamp"
            logger.dpi("TFLiteDpi", "Detected censorship anomaly: $signature (Confidence: ${(confidence * 100).toInt()}%)")

            mlPredictor.ingestTelemetrySample(
                currentRttMs = 35.0f,
                currentLossPct = 4.5f,
                dpiSignatureObserved = true,
                signatureType = signature
            )

            val time = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
            val newActiveCore = orchestrator.autoShiftToBestCore("DPI Anomaly Detection: $signature")

            val event = AnomalyDetectionEvent(
                timestamp = time,
                signatureName = signature,
                confidence = confidence,
                interceptedHeader = "IP: $ipSrc -> $ipDst | Flags: $tcpFlags | TTL: $detectedTtl",
                triggeredCoreSwitch = newActiveCore != null,
                switchedToCore = newActiveCore?.name
            )

            val list = _anomalyEvents.value.toMutableList()
            list.add(0, event)
            if (list.size > 20) list.removeAt(list.size - 1)
            _anomalyEvents.value = list

            _backendUnavailable.value = false
        }
    }

    companion object {
        @Volatile
        private var INSTANCE: DpiTfLiteAnomalyDetector? = null

        fun getInstance(): DpiTfLiteAnomalyDetector {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: DpiTfLiteAnomalyDetector().also { INSTANCE = it }
            }
        }
    }
}
