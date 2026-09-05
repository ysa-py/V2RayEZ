package com.unifiedshield.tunnel

import android.content.Context
import android.util.Log
import com.unifiedshield.CoreBridge
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class TransportMode(val id: Int, val titleEn: String, val titleFa: String, val tagline: String) {
    MODE_A_MULTIPATH(
        id = 0,
        titleEn = "Mode A — Parallel Multipath (QUIC)",
        titleFa = "حالت الف — انتقال چندمسیره موازی (QUIC)",
        tagline = "حداکثر پهنای باند و کمترین تاخیر با چند مسیر مستقل و رمزنگاری تک‌لایه"
    ),
    MODE_B_LAYERED(
        id = 1,
        titleEn = "Mode B — 5-Hop Nested Layered (Sphinx/Noise)",
        titleFa = "حالت ب — رمزنگاری پیازی ۵ لایه تو در تو (Sphinx)",
        tagline = "حداکثر ناشناسی و مقاومت در برابر همبستگی ترافیک با عبور از ۵ نود مستقل"
    )
}

enum class CongestionAlgo {
    BBR,
    CUBIC
}

data class QuicPathTelemetry(
    val pathId: Int,
    val endpoint: String,
    val regionTag: String,
    val rttMs: Int,
    val jitterMs: Int,
    val packetLossPct: Double,
    val bandwidthKbps: Long,
    val congestionState: String,
    val liveScore: Double,
    val currentMtu: Int,
    val packetsSent: Long,
    val bytesSent: Long,
    val measured: Boolean = false
)

data class LayeredHopNode(
    val hopIndex: Int, // 1..5
    val nodeId: String,
    val endpoint: String,
    val regionTag: String,
    val publicKey: String,
    val isHealthy: Boolean = false,
    val rttMs: Int = 0,
    val lossRate: Double = 0.0,
    val encryptionLayer: String = "",
    val measured: Boolean = false
)

data class BenchmarkItem(
    val title: String,
    val mode: String,
    val pathCount: Int,
    val lossPct: Double,
    val baseRttMs: Int,
    val throughputMbps: Double,
    val processingTimeNanos: Long,
    val memoryFootprintMb: Double,
    val measured: Boolean = false
)

data class DualModeState(
    val activeMode: TransportMode = TransportMode.MODE_A_MULTIPATH,
    val isAutoPilotAiEnabled: Boolean = true,
    val dpiDetectionLevel: String = "نامشخص",
    val dpiEntropyScore: Double = 0.0,
    val autoPilotReason: String = "بدون اندازه‌گیری واقعی، هیچ نتیجه‌ای گزارش نمی‌شود",
    val concurrentPaths: Int = 0,
    val congestionAlgo: CongestionAlgo = CongestionAlgo.BBR,
    val isPmtudEnabled: Boolean = false,
    val isFailClosedEnabled: Boolean = false,
    val allowDegradedFallback: Boolean = false,
    val isTcpMssClampingActive: Boolean = false,
    val clampedMssValue: Int = 1360,
    val cloudflareStallsMitigated: Long = 0,
    val isReorderingBufferActive: Boolean = false,
    val outOfOrderRealignedCount: Long = 0,
    val zeroCopyBufferSizeKb: Int = 0,
    val memoryFootprintMb: Double = 0.0,
    val schedulerRebalanceCount: Long = 0,
    val totalPeelsCount: Long = 0,
    val paths: List<QuicPathTelemetry> = emptyList(),
    val hops: List<LayeredHopNode> = emptyList(),
    val isBenchmarking: Boolean = false,
    val benchmarkResults: List<BenchmarkItem> = emptyList(),
    val logMessages: List<String> = emptyList(),
    val backendUnavailable: Boolean = true,
    val backendNote: String = "No real dual-mode transport measurements are wired in; path/hop telemetry is unavailable."
)

class DualModeTransportEngine private constructor(private val context: Context) {

    private val TAG = "DualModeTransport"
    private val coreBridge = CoreBridge()

    private val _state = MutableStateFlow(DualModeState())
    val state: StateFlow<DualModeState> = _state.asStateFlow()

    init {
        initializeEngine()
    }

    private fun initializeEngine() {
        _state.value = _state.value.copy(
            paths = emptyList(),
            hops = emptyList(),
            backendUnavailable = true,
            logMessages = listOf(
                "ENGINEERING DIRECTIVE v70 initialized with honest defaults.",
                "No real QUIC paths or layered hops have been measured; telemetry is unavailable."
            )
        )
        // The native call is a real configuration request, but this wrapper does
        // not fabricate the resulting transport telemetry.
        coreBridge.initDualModeTransportSafe("{\"mode\":\"unmeasured\",\"concurrent_paths\":0}")
    }

    /**
     * Accept a REAL measured QUIC path sample. This is the only source of path
     * telemetry; the engine never synthesizes it.
     */
    fun recordRealPathSample(sample: QuicPathTelemetry) {
        val updated = _state.value.copy(
            paths = listOf(sample) + _state.value.paths.filter { it.pathId != sample.pathId },
            backendUnavailable = false,
            backendNote = "Real QUIC path sample recorded."
        )
        _state.value = updated
    }

    /**
     * Accept a REAL layered-hop measurement.
     */
    fun recordRealHopSample(sample: LayeredHopNode) {
        val updated = _state.value.copy(
            hops = listOf(sample) + _state.value.hops.filter { it.hopIndex != sample.hopIndex },
            backendUnavailable = false,
            backendNote = "Real layered-hop measurement recorded."
        )
        _state.value = updated
    }

    fun setAutoPilot(enabled: Boolean) {
        _state.value = _state.value.copy(
            isAutoPilotAiEnabled = enabled,
            logMessages = (listOf("AI Auto-Pilot Autonomous Mode: ${if (enabled) "ENABLED" else "DISABLED"}") + _state.value.logMessages).take(15)
        )
    }

    /**
     * Explicit UI simulation only. It is labelled as a simulation and does not
     * imply real DPI detection happened.
     */
    fun simulateDpiSpike() {
        scope.launch {
            _state.value = _state.value.copy(
                dpiDetectionLevel = "شبیه‌سازی حمله DPI (نه تشخیص واقعی)",
                dpiEntropyScore = 0.42,
                backendUnavailable = true,
                backendNote = "Simulation only; no real DPI sensor produced this state.",
                logMessages = (listOf("[SIMULATION] DPI Stress Test Injected") + _state.value.logMessages).take(15)
            )
            delay(500)
            if (_state.value.isAutoPilotAiEnabled) {
                setTransportMode(TransportMode.MODE_B_LAYERED)
            }
        }
    }

    fun setTransportMode(mode: TransportMode) {
        val modeId = if (mode == TransportMode.MODE_B_LAYERED) 1 else 0
        coreBridge.switchTransportModeSafe(modeId)
        val modeLog = if (mode == TransportMode.MODE_A_MULTIPATH) {
            "Switched to Mode A (Parallel QUIC, ${state.value.concurrentPaths} paths)"
        } else {
            "Switched to Mode B (5-Hop Layered Sphinx Circuit with fail-closed enforcement)"
        }

        _state.value = _state.value.copy(
            activeMode = mode,
            logMessages = (listOf(modeLog) + _state.value.logMessages).take(15)
        )
        Log.i(TAG, modeLog)
    }

    /**
     * Sets the desired concurrent-path count, but does NOT fabricate measured
     * QUIC paths for the requested count.
     */
    fun setConcurrentPaths(count: Int) {
        val clamped = count.coerceIn(0, 5)
        _state.value = _state.value.copy(
            concurrentPaths = clamped,
            logMessages = (listOf("Desired Mode A concurrent paths set to $clamped (no measured paths fabricated)") + _state.value.logMessages).take(15)
        )
    }

    fun setCongestionAlgo(algo: CongestionAlgo) {
        _state.value = _state.value.copy(
            congestionAlgo = algo,
            logMessages = (listOf("Updated congestion control to ${algo.name}") + _state.value.logMessages).take(15)
        )
    }

    fun setFailClosed(enabled: Boolean) {
        _state.value = _state.value.copy(
            isFailClosedEnabled = enabled,
            logMessages = (listOf("Mode B Fail-Closed Protection: ${if (enabled) "ENABLED" else "DISABLED"}") + _state.value.logMessages).take(15)
        )
    }

    /**
     * Toggles health of a REAL measured hop only. Does not fabricate hop outages.
     */
    fun toggleHopHealth(hopIndex: Int) {
        val currentHops = _state.value.hops.map { h ->
            if (h.hopIndex == hopIndex) {
                val newHealth = !h.isHealthy
                h.copy(
                    isHealthy = newHealth,
                    lossRate = if (newHealth) 0.0 else 0.95
                )
            } else {
                h
            }
        }
        val targetHop = currentHops.find { it.hopIndex == hopIndex }
        val healthLog = when {
            targetHop == null -> "SIMULATION: hop $hopIndex not measured; no health toggle applied."
            targetHop.isHealthy -> "Hop $hopIndex (${targetHop.regionTag}) restored to HEALTHY"
            else -> "SIMULATION: Hop $hopIndex marked unhealthy (95% loss). Fail-closed will drop packets."
        }

        _state.value = _state.value.copy(
            hops = currentHops,
            logMessages = (listOf(healthLog) + _state.value.logMessages).take(15)
        )
    }

    /**
     * Benchmarking is unavailable without a real transport backend. It does not
     * fabricate measured throughput/memory numbers.
     */
    fun runBenchmark() {
        scope.launch {
            _state.value = _state.value.copy(
                isBenchmarking = false,
                benchmarkResults = emptyList(),
                backendUnavailable = true,
                backendNote = "Real benchmark backend is not wired in; no results generated.",
                logMessages = (listOf("Benchmark request acknowledged; no real backend wired, no results fabricated.") + _state.value.logMessages).take(15)
            )
        }
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    companion object {
        @Volatile
        private var instance: DualModeTransportEngine? = null

        fun getInstance(context: Context): DualModeTransportEngine {
            return instance ?: synchronized(this) {
                instance ?: DualModeTransportEngine(context.applicationContext).also { instance = it }
            }
        }
    }
}
