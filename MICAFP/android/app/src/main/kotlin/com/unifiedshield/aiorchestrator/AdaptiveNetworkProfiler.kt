package com.unifiedshield.aiorchestrator

import android.util.Log
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Adaptive Network Profiler Service.
 *
 * ANTI-FABRICATION (2026-09-04): The profiling cycle previously synthesized
 * RTT, packet loss, handshake success and jitter from protocol name + `Random`
 * and then "updated" the orchestrator scoring matrix with those fake values.
 *
 * Correct behavior now:
 *   - Battery-saver controls remain genuine.
 *   - `runProfilingCycle()` never fabricates probe results; if a caller supplies
 *     real `CoreScoreEntry` results it can still update the matrix, but no
 *     background loop invents telemetry.
 */
class AdaptiveNetworkProfiler private constructor() {

    private val TAG = "NetworkProfiler"
    private val logger = DebugLogger.getInstance()
    private val orchestrator = AiCoreOrchestrator.getInstance()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private var profilerJob: Job? = null
    private val _isProfilingActive = MutableStateFlow(false)
    val isProfilingActive: StateFlow<Boolean> = _isProfilingActive.asStateFlow()

    private val _isBatterySaverEnabled = MutableStateFlow(false)
    val isBatterySaverEnabled: StateFlow<Boolean> = _isBatterySaverEnabled.asStateFlow()

    private val _batterySaverProfile = MutableStateFlow(BatterySaverProfile.BALANCED)
    val batterySaverProfile: StateFlow<BatterySaverProfile> = _batterySaverProfile.asStateFlow()

    private val _deviceBatteryLevel = MutableStateFlow(100)
    val deviceBatteryLevel: StateFlow<Int> = _deviceBatteryLevel.asStateFlow()

    private val _lastProfileTimestamp = MutableStateFlow(0L)
    val lastProfileTimestamp: StateFlow<Long> = _lastProfileTimestamp.asStateFlow()

    private val _profilerStats = MutableStateFlow("Idle. Real network probe backend is not wired in.")
    val profilerStats: StateFlow<String> = _profilerStats.asStateFlow()

    private val mlPredictor = IspDpiCorrelationPredictor.getInstance()

    init {
        // No auto-start of synthesized probing. This avoids fabricating results.
    }

    fun setBatterySaverEnabled(enabled: Boolean) {
        _isBatterySaverEnabled.value = enabled
        logger.info("Profiler", "Battery Saver Mode updated to: $enabled")
    }

    fun setBatterySaverProfile(profile: BatterySaverProfile) {
        _batterySaverProfile.value = profile
        logger.info("Profiler", "Battery Saver Profile set to: ${profile.name} (Interval: ${profile.intervalMs / 1000}s)")
    }

    fun updateBatteryLevel(level: Int) {
        _deviceBatteryLevel.value = level
        if (level < 15 && !_isBatterySaverEnabled.value) {
            _isBatterySaverEnabled.value = true
            _batterySaverProfile.value = BatterySaverProfile.AGGRESSIVE_SAVER
            logger.info("Profiler", "Auto-enabled aggressive battery saver due to low battery ($level%)")
        }
    }

    fun isPowerSaveModeActive(): Boolean {
        return _isBatterySaverEnabled.value || _deviceBatteryLevel.value < 20
    }

    /**
     * Kept for API compatibility. Without a real probe backend this does not
     * produce data; it only logs the honest unavailable state.
     */
    fun startProfilingLoop() {
        profilerJob?.cancel()
        _isProfilingActive.value = false
        _profilerStats.value = "Network profiling requested, but no real probe backend is wired in."
    }

    fun stopProfiling() {
        _isProfilingActive.value = false
        profilerJob?.cancel()
        _profilerStats.value = "Profiler paused."
    }

    /**
     * Invoked only by a real caller with measured CoreScoreEntry data. It does
     * not invent any metric.
     */
    suspend fun applyRealProfile(updatedList: List<CoreScoreEntry>) {
        if (updatedList.isEmpty()) {
            _profilerStats.value = "No real probe data supplied; scoring matrix unchanged."
            return
        }
        orchestrator.updateScoringMatrix(updatedList)
        _lastProfileTimestamp.value = System.currentTimeMillis()
        val highest = updatedList.maxByOrNull { it.score }
        _profilerStats.value = "Applied real probe data. Top core: ${highest?.name} (${highest?.score} pts, ${highest?.latencyMs}ms)"
        if (highest != null) {
            mlPredictor.ingestTelemetrySample(
                currentRttMs = highest.latencyMs.toFloat(),
                currentLossPct = highest.packetLossPct.toFloat(),
                dpiSignatureObserved = highest.packetLossPct > 2.0 || highest.latencyMs > 28,
                signatureType = if (highest.packetLossPct > 2.0) "Packet Loss Jitter Surge" else null
            )
        }
    }

    /**
     * Fails closed: no synthesized probes, no fabricated matrix update.
     */
    suspend fun runProfilingCycle() {
        _profilerStats.value = "No real network probe backend is wired in; profiling results unavailable."
        logger.warn(TAG, "runProfilingCycle called without a real probe backend; results NOT fabricated.")
    }

    companion object {
        @Volatile
        private var INSTANCE: AdaptiveNetworkProfiler? = null

        fun getInstance(): AdaptiveNetworkProfiler {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: AdaptiveNetworkProfiler().also { INSTANCE = it }
            }
        }
    }
}

enum class BatterySaverProfile(val labelFa: String, val intervalMs: Long) {
    HIGH_PERFORMANCE_REALTIME("عملکرد بلادرنگ فوق‌العاده", 20_000L),
    BALANCED("بهینه متوازن (پیش‌فرض)", 60_000L),
    AGGRESSIVE_SAVER("صرفه‌جویی حداکثری باتری", 180_000L),
    EXTREME_POWER_SAVE("فوق‌کم‌مصرف کوانتومی", 300_000L)
}
