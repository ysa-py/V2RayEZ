package com.v2rayez.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.v2rayez.app.domain.model.AppSettings
import com.v2rayez.app.domain.model.DnsConfig
import com.v2rayez.app.domain.model.FragmentConfig
import com.v2rayez.app.domain.model.Protocol
import com.v2rayez.app.domain.model.Server
import com.v2rayez.app.domain.repository.DEFAULT_SITE_FETCH_URL
import com.v2rayez.app.domain.repository.ServerRepository
import com.v2rayez.app.domain.repository.SettingsRepository
import com.v2rayez.app.domain.repository.VpnController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject
import kotlin.math.abs
import kotlin.math.roundToInt

/** UAC-style route-racing phases: qualification → stability → stress → final A/B/B/A. */
enum class RouteMatrixPhase { IDLE, QUALIFICATION, STABILITY, STRESS, FINAL_ABBA, DONE, ERROR }

/** DNS dimension for the Edge × DNS × Fragment × MTU matrix. */
enum class RouteDnsPreset(
    val label: String,
    val remoteDns: String,
    val domesticDns: String,
    val enableFakeDns: Boolean
) {
    CLOUDFLARE_ALIYUN("Cloudflare + AliDNS", "1.1.1.1", "223.5.5.5", false),
    QUAD9_ALIYUN("Quad9 + AliDNS", "9.9.9.9", "223.5.5.5", false),
    ADGUARD_ALIYUN("AdGuard + AliDNS", "94.140.14.14", "223.5.5.5", false),
    ALIYUN_ONLY("AliDNS domestic", "223.5.5.5", "223.6.6.6", false),
    FAKE_DNS("FakeDNS guarded", "1.1.1.1", "223.5.5.5", true)
}

/** Fragment dimension for the Edge × DNS × Fragment × MTU matrix. */
enum class RouteFragmentPreset(val label: String) {
    OFF("Off"),
    FAST("Fast 64–128B"),
    BALANCED("Balanced 100–200B"),
    STEALTH("Stealth 256–512B");

    fun toConfig(): FragmentConfig = when (this) {
        OFF -> FragmentConfig(enabled = false)
        FAST -> FragmentConfig(enabled = true, packets = "tlshello", length = "64-128", interval = "1-4")
        BALANCED -> FragmentConfig(enabled = true, packets = "tlshello", length = "100-200", interval = "10-20")
        STEALTH -> FragmentConfig(enabled = true, packets = "tlshello", length = "256-512", interval = "20-45")
    }
}

data class RouteMatrixCandidate(
    val edge: Server,
    val dns: RouteDnsPreset,
    val fragment: RouteFragmentPreset,
    val mtu: Int
) {
    val key: String = "${edge.id}|${dns.name}|${fragment.name}|$mtu"
    val label: String = "${edge.name} · ${dns.label} · ${fragment.label} · MTU $mtu"

    fun applyTo(settings: AppSettings): AppSettings = settings.copy(
        mtu = mtu,
        dns = DnsConfig(
            remoteDns = dns.remoteDns,
            domesticDns = dns.domesticDns,
            enableFakeDns = dns.enableFakeDns,
            hosts = settings.dns.hosts
        ),
        fragment = fragment.toConfig()
    )
}

data class RouteMatrixResult(
    val candidate: RouteMatrixCandidate,
    val phase: RouteMatrixPhase,
    val latencyMs: Int = -1,
    val jitterMs: Int = -1,
    val throughputMbps: Double = 0.0,
    val successRate: Double = 0.0,
    val confidence: Double = 0.0,
    val score: Double = 0.0,
    val sampleCount: Int = 0,
    val message: String = ""
)

data class RouteSpeedTestUiState(
    val phase: RouteMatrixPhase = RouteMatrixPhase.IDLE,
    val running: Boolean = false,
    val progress: Float = 0f,
    val activeLabel: String = "",
    val totalCandidates: Int = 0,
    val testedCandidates: Int = 0,
    val edgeCount: Int = 0,
    val results: List<RouteMatrixResult> = emptyList(),
    val winner: RouteMatrixResult? = null,
    val appliedWinner: Boolean = false,
    val error: String? = null
)

/**
 * Exhaustive UAC-style route speed test over a bounded mobile-safe edge set.
 *
 * The matrix is Edge × DNS × Fragment × MTU. Each candidate is applied to the same V2RayEZ
 * settings model used by the real connect/test path, then restored after probing. The staged
 * competition uses quick TCP qualification, stability repeats, throughput/site-fetch stress,
 * and a final A/B/B/A pass so transient ordering effects are reduced.
 */
@HiltViewModel
class RouteSpeedTestViewModel @Inject constructor(
    private val servers: ServerRepository,
    private val vpn: VpnController,
    private val settings: SettingsRepository
) : ViewModel() {

    val availableEdgeCount: StateFlow<Int> = servers.servers()
        .map { list -> list.count { it.isRouteRaceEdge() } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    private val _state = MutableStateFlow(RouteSpeedTestUiState())
    val state: StateFlow<RouteSpeedTestUiState> = _state.asStateFlow()

    private var job: Job? = null

    fun start() {
        if (_state.value.running) return
        job = viewModelScope.launch {
            _state.value = RouteSpeedTestUiState(phase = RouteMatrixPhase.QUALIFICATION, running = true)
            val originalSettings = settings.current()
            val rows = linkedMapOf<String, RouteMatrixResult>()
            try {
                val allEdges = servers.servers().first()
                    .filter { it.isRouteRaceEdge() }
                    .sortedWith(compareByDescending<Server> { it.isFavorite }
                        .thenBy { if (it.pingMs > 0) it.pingMs else Int.MAX_VALUE }
                        .thenBy { it.name })
                val edges = allEdges.take(EDGE_LIMIT)
                if (edges.isEmpty()) error("No compatible proxy edges are available for the route matrix")
                val candidates = buildMatrix(edges)
                publish(rows, RouteMatrixPhase.QUALIFICATION, 0, candidates.size, "", edges.size)

                val qualified = runStage(
                    candidates = candidates,
                    rows = rows,
                    phase = RouteMatrixPhase.QUALIFICATION,
                    total = candidates.size,
                    edgeCount = edges.size,
                    quickSamples = 1,
                    siteFetches = 0,
                    throughputBytes = 0L,
                    applyCandidateSettings = false
                ).filter { it.successRate > 0.0 }
                    .sortedByDescending { it.score }
                    .take(QUALIFICATION_WINNERS)
                if (qualified.isEmpty()) error("No matrix candidate passed TCP qualification")

                val stable = runStage(
                    candidates = qualified.map { it.candidate },
                    rows = rows,
                    phase = RouteMatrixPhase.STABILITY,
                    total = qualified.size,
                    edgeCount = edges.size,
                    quickSamples = STABILITY_REPEATS,
                    siteFetches = 0,
                    throughputBytes = 0L,
                    applyCandidateSettings = true,
                    originalSettings = originalSettings
                ).filter { it.successRate >= MIN_STABILITY_SUCCESS }
                    .sortedByDescending { it.score }
                    .take(STRESS_WINNERS)
                if (stable.isEmpty()) error("No matrix candidate stayed stable across repeated probes")

                val stressed = runStage(
                    candidates = stable.map { it.candidate },
                    rows = rows,
                    phase = RouteMatrixPhase.STRESS,
                    total = stable.size,
                    edgeCount = edges.size,
                    quickSamples = 1,
                    siteFetches = STRESS_FETCHES,
                    throughputBytes = STRESS_BYTES,
                    applyCandidateSettings = true,
                    originalSettings = originalSettings
                ).filter { it.successRate >= MIN_STRESS_SUCCESS }
                    .sortedByDescending { it.score }
                    .take(FINALISTS)
                if (stressed.isEmpty()) error("No matrix candidate passed HTTP/throughput stress")

                val finalists = stressed.map { it.candidate }.take(2)
                val finalResults = runFinalAbba(
                    finalists = finalists,
                    rows = rows,
                    total = FINAL_ABBA_ORDER.size,
                    edgeCount = edges.size,
                    originalSettings = originalSettings
                )
                val winner = finalResults.maxByOrNull { it.score } ?: stressed.first()
                rows[winner.candidate.key] = winner
                settings.update { originalSettings }
                _state.update {
                    it.copy(
                        phase = RouteMatrixPhase.DONE,
                        running = false,
                        progress = 1f,
                        activeLabel = winner.candidate.label,
                        winner = winner,
                        results = rows.values.sortedByDescending { r -> r.score }.take(DISPLAY_ROWS),
                        error = null
                    )
                }
            } catch (cancel: CancellationException) {
                settings.update { originalSettings }
                throw cancel
            } catch (e: Exception) {
                settings.update { originalSettings }
                _state.update {
                    it.copy(
                        phase = RouteMatrixPhase.ERROR,
                        running = false,
                        activeLabel = "",
                        error = e.message ?: "Route matrix test failed"
                    )
                }
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
        _state.update { it.copy(running = false, phase = RouteMatrixPhase.IDLE, activeLabel = "") }
    }

    fun applyWinner() {
        val winner = _state.value.winner ?: return
        viewModelScope.launch {
            settings.update { winner.candidate.applyTo(it) }
            _state.update { it.copy(appliedWinner = true, activeLabel = winner.candidate.label) }
        }
    }

    private suspend fun runStage(
        candidates: List<RouteMatrixCandidate>,
        rows: MutableMap<String, RouteMatrixResult>,
        phase: RouteMatrixPhase,
        total: Int,
        edgeCount: Int,
        quickSamples: Int,
        siteFetches: Int,
        throughputBytes: Long,
        applyCandidateSettings: Boolean,
        originalSettings: AppSettings? = null
    ): List<RouteMatrixResult> {
        val out = mutableListOf<RouteMatrixResult>()
        candidates.forEachIndexed { index, candidate ->
            currentCoroutineContext().ensureActive()
            publish(rows, phase, index, total, candidate.label, edgeCount)
            val result = if (applyCandidateSettings && originalSettings != null) {
                withCandidateSettings(candidate, originalSettings) {
                    probe(candidate, phase, quickSamples, siteFetches, throughputBytes)
                }
            } else {
                probe(candidate, phase, quickSamples, siteFetches, throughputBytes)
            }
            rows[candidate.key] = result
            out += result
            publish(rows, phase, index + 1, total, candidate.label, edgeCount)
        }
        return out
    }

    private suspend fun runFinalAbba(
        finalists: List<RouteMatrixCandidate>,
        rows: MutableMap<String, RouteMatrixResult>,
        total: Int,
        edgeCount: Int,
        originalSettings: AppSettings
    ): List<RouteMatrixResult> {
        if (finalists.isEmpty()) return emptyList()
        val samples = linkedMapOf<RouteMatrixCandidate, MutableList<RouteMatrixResult>>()
        FINAL_ABBA_ORDER.forEachIndexed { index, orderIndex ->
            currentCoroutineContext().ensureActive()
            val candidate = finalists[orderIndex.coerceAtMost(finalists.lastIndex)]
            publish(rows, RouteMatrixPhase.FINAL_ABBA, index, total, candidate.label, edgeCount)
            val result = withCandidateSettings(candidate, originalSettings) {
                probe(candidate, RouteMatrixPhase.FINAL_ABBA, quickSamples = 1, siteFetches = 1, throughputBytes = FINAL_BYTES)
            }
            samples.getOrPut(candidate) { mutableListOf() } += result
            rows[candidate.key] = aggregate(candidate, RouteMatrixPhase.FINAL_ABBA, samples.getValue(candidate))
            publish(rows, RouteMatrixPhase.FINAL_ABBA, index + 1, total, candidate.label, edgeCount)
        }
        return samples.map { (candidate, values) -> aggregate(candidate, RouteMatrixPhase.FINAL_ABBA, values) }
    }

    private suspend fun <T> withCandidateSettings(
        candidate: RouteMatrixCandidate,
        originalSettings: AppSettings,
        block: suspend () -> T
    ): T {
        settings.update { candidate.applyTo(originalSettings) }
        return try {
            // Give DataStore readers and the throwaway Xray test path a short chance to observe it.
            delay(SETTINGS_SETTLE_MS)
            block()
        } finally {
            settings.update { originalSettings }
        }
    }

    private suspend fun probe(
        candidate: RouteMatrixCandidate,
        phase: RouteMatrixPhase,
        quickSamples: Int,
        siteFetches: Int,
        throughputBytes: Long
    ): RouteMatrixResult = withContext(Dispatchers.IO) {
        val latencies = mutableListOf<Int>()
        val throughputs = mutableListOf<Double>()
        val messages = mutableListOf<String>()
        var successes = 0
        var probes = 0

        repeat(quickSamples) {
            currentCoroutineContext().ensureActive()
            probes++
            val quick = runCatching { vpn.testLatencyQuick(candidate.edge) }.getOrElse {
                messages += it.message ?: "TCP probe failed"
                return@repeat
            }
            if (quick.success && quick.pingMs > 0) {
                successes++
                latencies += quick.pingMs
            } else {
                messages += quick.message.ifBlank { "TCP probe failed" }
            }
            delay(QUICK_REPEAT_DELAY_MS)
        }

        repeat(siteFetches) { idx ->
            currentCoroutineContext().ensureActive()
            probes++
            val url = if (throughputBytes > 0) throughputUrl(throughputBytes, idx) else DEFAULT_SITE_FETCH_URL
            val site = runCatching { vpn.testSiteFetch(candidate.edge, url) }.getOrElse {
                messages += it.message ?: "HTTP probe failed"
                return@repeat
            }
            val ms = site.siteMs ?: site.pingMs
            if (site.success && ms > 0) {
                successes++
                latencies += ms
                if (throughputBytes > 0) {
                    throughputs += mbps(throughputBytes, ms)
                }
            } else {
                messages += site.siteMessage ?: site.message.ifBlank { "HTTP probe failed" }
            }
            delay(SITE_REPEAT_DELAY_MS)
        }

        val successRate = if (probes == 0) 0.0 else successes.toDouble() / probes.toDouble()
        val latency = latencies.averageOrMinusOne()
        val jitter = latencies.jitterOrMinusOne()
        val throughput = throughputs.takeIf { it.isNotEmpty() }?.average() ?: 0.0
        val confidence = confidence(successRate, latencies.size, throughputs.size, phase)
        val score = score(successRate, latency, jitter, throughput, confidence)
        RouteMatrixResult(
            candidate = candidate,
            phase = phase,
            latencyMs = latency,
            jitterMs = jitter,
            throughputMbps = throughput,
            successRate = successRate,
            confidence = confidence,
            score = score,
            sampleCount = probes,
            message = messages.firstOrNull().orEmpty()
        )
    }

    private fun aggregate(
        candidate: RouteMatrixCandidate,
        phase: RouteMatrixPhase,
        values: List<RouteMatrixResult>
    ): RouteMatrixResult {
        val ok = values.filter { it.successRate > 0.0 }
        val latency = ok.map { it.latencyMs }.filter { it > 0 }.averageOrMinusOne()
        val jitter = ok.map { it.jitterMs }.filter { it >= 0 }.averageOrMinusOne()
        val throughput = ok.map { it.throughputMbps }.filter { it > 0.0 }.takeIf { it.isNotEmpty() }?.average() ?: 0.0
        val successRate = if (values.isEmpty()) 0.0 else values.map { it.successRate }.average()
        val sampleCount = values.sumOf { it.sampleCount }
        val confidence = confidence(successRate, sampleCount, ok.count { it.throughputMbps > 0.0 }, phase)
        return RouteMatrixResult(
            candidate = candidate,
            phase = phase,
            latencyMs = latency,
            jitterMs = jitter,
            throughputMbps = throughput,
            successRate = successRate,
            confidence = confidence,
            score = score(successRate, latency, jitter, throughput, confidence),
            sampleCount = sampleCount,
            message = values.firstOrNull { it.message.isNotBlank() }?.message.orEmpty()
        )
    }

    private fun publish(
        rows: Map<String, RouteMatrixResult>,
        phase: RouteMatrixPhase,
        tested: Int,
        total: Int,
        active: String,
        edgeCount: Int
    ) {
        _state.update {
            it.copy(
                phase = phase,
                running = phase != RouteMatrixPhase.DONE && phase != RouteMatrixPhase.ERROR && phase != RouteMatrixPhase.IDLE,
                progress = if (total <= 0) 0f else (tested.toFloat() / total.toFloat()).coerceIn(0f, 1f),
                activeLabel = active,
                totalCandidates = total,
                testedCandidates = tested,
                edgeCount = edgeCount,
                results = rows.values.sortedByDescending { row -> row.score }.take(DISPLAY_ROWS),
                winner = rows.values.maxByOrNull { row -> row.score },
                error = null
            )
        }
    }

    private fun buildMatrix(edges: List<Server>): List<RouteMatrixCandidate> = buildList {
        edges.forEach { edge ->
            RouteDnsPreset.entries.forEach { dns ->
                RouteFragmentPreset.entries.forEach { fragment ->
                    MTU_PRESETS.forEach { mtu ->
                        add(RouteMatrixCandidate(edge, dns, fragment, mtu))
                    }
                }
            }
        }
    }

    private fun Server.isRouteRaceEdge(): Boolean =
        host.isNotBlank() && port in 1..65535 && protocol in SUPPORTED_EDGE_PROTOCOLS

    private fun List<Int>.averageOrMinusOne(): Int =
        if (isEmpty()) -1 else average().roundToInt()

    private fun List<Int>.jitterOrMinusOne(): Int {
        if (size <= 1) return if (isEmpty()) -1 else 0
        return zipWithNext { a, b -> abs(a - b) }.average().roundToInt()
    }

    private fun mbps(bytes: Long, ms: Int): Double =
        if (ms <= 0) 0.0 else bytes * 8.0 / 1_000_000.0 / (ms.toDouble() / 1000.0)

    private fun confidence(successRate: Double, latencySamples: Int, throughputSamples: Int, phase: RouteMatrixPhase): Double {
        val phaseWeight = when (phase) {
            RouteMatrixPhase.QUALIFICATION -> 0.20
            RouteMatrixPhase.STABILITY -> 0.55
            RouteMatrixPhase.STRESS -> 0.78
            RouteMatrixPhase.FINAL_ABBA -> 1.0
            else -> 0.10
        }
        val sampleWeight = ((latencySamples + throughputSamples).toDouble() / 8.0).coerceIn(0.0, 1.0)
        return (successRate * 0.55 + sampleWeight * 0.25 + phaseWeight * 0.20).coerceIn(0.0, 1.0)
    }

    private fun score(successRate: Double, latency: Int, jitter: Int, throughput: Double, confidence: Double): Double {
        val latencyScore = if (latency > 0) 1000.0 / (latency + 25.0) else 0.0
        val jitterPenalty = if (jitter > 0) jitter * 1.8 else 0.0
        return successRate * 450.0 + latencyScore * 90.0 + throughput * 18.0 + confidence * 120.0 - jitterPenalty
    }

    private fun throughputUrl(bytes: Long, idx: Int): String =
        "$CLOUDFLARE_SPEED_BASE/__down?bytes=$bytes&v2rayez_route_matrix=$idx"

    companion object {
        private val SUPPORTED_EDGE_PROTOCOLS = setOf(Protocol.VLESS, Protocol.VMESS, Protocol.TROJAN, Protocol.SHADOWSOCKS, Protocol.WIREGUARD, Protocol.SSH)
        private val MTU_PRESETS = listOf(1280, 1360, 1420, 1500)
        private val FINAL_ABBA_ORDER = listOf(0, 1, 1, 0)
        private const val EDGE_LIMIT = 4
        private const val QUALIFICATION_WINNERS = 16
        private const val STABILITY_REPEATS = 3
        private const val STRESS_WINNERS = 8
        private const val STRESS_FETCHES = 2
        private const val FINALISTS = 4
        private const val DISPLAY_ROWS = 24
        private const val STRESS_BYTES = 250_000L
        private const val FINAL_BYTES = 500_000L
        private const val SETTINGS_SETTLE_MS = 120L
        private const val QUICK_REPEAT_DELAY_MS = 70L
        private const val SITE_REPEAT_DELAY_MS = 120L
        private const val MIN_STABILITY_SUCCESS = 0.34
        private const val MIN_STRESS_SUCCESS = 0.34
        private const val CLOUDFLARE_SPEED_BASE = "https://speed.cloudflare.com"
    }
}
