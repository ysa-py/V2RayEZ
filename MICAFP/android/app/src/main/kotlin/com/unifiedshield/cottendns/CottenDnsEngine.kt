package com.unifiedshield.cottendns

import android.content.Context
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * CottenDNS transport engine.
 *
 * ANTI-FABRICATION (2026-09-04): This class previously seeded four fake resolver
 * paths with 98–100% delivery and 12–21ms RTT, plus a background loop that
 * advanced FEC/poison counters and jittered RTT/delivery with `.random()`. No real
 * CottenDNS probe/resolver backend ran.
 *
 * Correct behavior now:
 *   - Default state is `backendUnavailable=true`, no paths, zero counters.
 *   - Config toggles remain, but they do not fabricate measurements.
 *   - `recordRealPathSample(...)` is the explicit real-data path.
 */
class CottenDnsEngine private constructor(private val context: Context) {

    private val TAG = "CottenDnsEngine"
    private val logger = DebugLogger.getInstance()

    private val _state = MutableStateFlow(CottenDnsState())
    val state: StateFlow<CottenDnsState> = _state

    init {
        logger.addLog("CottenDNS Engine", "Engine initialized fail-closed; no real resolver backend wired.")
    }

    fun recordRealPathSample(sample: CottenPathMetric) {
        if (!sample.measured) {
            logger.addLog("CottenDNS Engine", "Refused unmeasured path sample; no telemetry fabricated.")
            return
        }
        _state.value = _state.value.copy(
            paths = listOf(sample) + _state.value.paths.filter { it.id != sample.id },
            backendUnavailable = false,
            backendNote = "Real CottenDNS path sample recorded."
        )
    }

    fun recordRealCounters(fecFrames: Long, replayFrames: Long, poisonDefeated: Long) {
        _state.value = _state.value.copy(
            fecFramesRecovered = fecFrames,
            inFlightFrameReplayCount = replayFrames,
            poisonAttemptsDefeated = poisonDefeated,
            backendUnavailable = false,
            backendNote = "Real CottenDNS counters recorded."
        )
    }

    fun updateFecMode(mode: CottenFecMode) {
        _state.value = _state.value.copy(fecMode = mode)
        logger.addLog("CottenDNS Engine", "FEC mode changed to: ${mode.label}")
    }

    fun updateRecordRotation(rot: CottenRecordRotation) {
        _state.value = _state.value.copy(recordRotation = rot)
        logger.addLog("CottenDNS Engine", "Anti-DPI Record Rotation set to: ${rot.label}")
    }

    fun toggleAdaptive(enabled: Boolean) {
        _state.value = _state.value.copy(autoAdaptiveTransportEnabled = enabled)
    }

    fun toggleEarlyPoisonRacing(enabled: Boolean) {
        _state.value = _state.value.copy(earlyPoisonRacingEnabled = enabled)
    }

    fun toggleEqualPathStriping(enabled: Boolean) {
        _state.value = _state.value.copy(equalPathStripingEnabled = enabled)
    }

    fun toggleQnameReshaping(enabled: Boolean) {
        _state.value = _state.value.copy(qnameReshapingEnabled = enabled)
    }

    companion object {
        @Volatile
        private var instance: CottenDnsEngine? = null

        fun getInstance(context: Context): CottenDnsEngine {
            return instance ?: synchronized(this) {
                instance ?: CottenDnsEngine(context.applicationContext).also { instance = it }
            }
        }
    }
}
