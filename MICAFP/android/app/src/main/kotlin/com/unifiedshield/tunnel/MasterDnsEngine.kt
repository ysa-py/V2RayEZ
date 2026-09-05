package com.unifiedshield.tunnel

import android.content.Context
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * MasterDNS multi-resolver engine.
 *
 * ANTI-FABRICATION (2026-09-04): This class previously seeded 18,450+ transmitted
 * packets, 94.6 Mbps, 94% cache-hit ratio, hard-coded 0.270s handshakes and a
 * background loop that advanced packets/speed/cache with `.random()`. Resolver
 * probing also invented ping/answered counts. No real MasterDNS backend ran.
 *
 * Correct behavior now:
 *   - Default metrics are zero/`backendUnavailable=true`.
 *   - `probeResolvers(...)` does NOT fabricate ping or query counts.
 *   - `recordRealResolverSample(...)` / `recordRealCounters(...)` are the real-data
 *     paths.
 */
data class MasterDnsLiveMetrics(
    val isRunning: Boolean = false,
    val activeResolversCount: Int = 0,
    val packetsTransmitted: Long = 0,
    val packetsReceived: Long = 0,
    val retransmissionsCount: Long = 0,
    val packetLossPercentage: Double = 0.0,
    val speedMbps: Double = 0.0,
    val speedMultiplierVsDnstt: Double = 0.0,
    val speedMultiplierVsSlipstream: Double = 0.0,
    val overheadBytes: Int = 0,
    val overheadReductionVsDnsttPct: Int = 0,
    val overheadReductionVsSlipstreamPct: Int = 0,
    val currentHandshakeDurationSec: Double = 0.0,
    val standardDnsHandshakeSec: Double = 0.0,
    val cacheHitRatioPct: Int = 0,
    val duplicationPacketsSent: Long = 0,
    val activeBalancingMode: MasterDnsBalancingMode = MasterDnsBalancingMode.LATENCY_BASED,
    val activeCarrier: MasterDnsTcpCarrier = MasterDnsTcpCarrier.SHADOWSOCKS_CARRIER,
    val socksOptimizationSavedKb: Long = 0,
    val backendUnavailable: Boolean = true,
    val backendNote: String = "No real MasterDns backend is wired in; metrics are unavailable."
)

class MasterDnsEngine private constructor(private val context: Context) {

    private val TAG = "MasterDnsEngine"
    private val logger = DebugLogger.getInstance()

    private val _liveMetrics = MutableStateFlow(MasterDnsLiveMetrics())
    val liveMetrics: StateFlow<MasterDnsLiveMetrics> = _liveMetrics

    init {
        logger.tunnel(TAG, "MasterDnsVPN initialized fail-closed; no real resolver backend wired.")
    }

    fun recordRealResolverSample(sample: MasterDnsResolverNode) {
        if (!sample.measured) {
            logger.warn(TAG, "MasterDns refused unmeasured resolver sample; no fabricated metrics.")
            return
        }
        val config = currentConfigWithSample(sample)
        val updated = _liveMetrics.value.copy(
            activeResolversCount = config.resolvers.size,
            backendUnavailable = false,
            backendNote = "Real MasterDns resolver sample recorded."
        )
        _liveMetrics.value = updated
    }

    private fun currentConfigWithSample(sample: MasterDnsResolverNode): MasterDnsConfig {
        val existing = latestRecordedConfig
        return existing.copy(
            resolvers = listOf(sample) + existing.resolvers.filter { it.id != sample.id }
        )
    }

    private var latestRecordedConfig = MasterDnsConfig()

    fun recordRealConfig(config: MasterDnsConfig) {
        latestRecordedConfig = config
        _liveMetrics.value = _liveMetrics.value.copy(
            activeResolversCount = config.resolvers.size,
            backendUnavailable = config.resolvers.all { !it.measured },
            backendNote = if (config.resolvers.any { it.measured }) "Real MasterDns resolver data configured." else "No real resolver measurements supplied."
        )
    }

    fun recordRealCounters(
        packetsTx: Long,
        packetsRx: Long,
        retransmissions: Long,
        lossPct: Double,
        speedMbps: Double,
        cacheHitPct: Int,
        handshakeSec: Double,
        duplicationPackets: Long
    ) {
        _liveMetrics.value = _liveMetrics.value.copy(
            packetsTransmitted = packetsTx,
            packetsReceived = packetsRx,
            retransmissionsCount = retransmissions,
            packetLossPercentage = lossPct,
            speedMbps = speedMbps,
            cacheHitRatioPct = cacheHitPct,
            currentHandshakeDurationSec = handshakeSec,
            duplicationPacketsSent = duplicationPackets,
            backendUnavailable = false,
            backendNote = "Real MasterDns counters recorded."
        )
    }

    fun setBalancingMode(mode: MasterDnsBalancingMode) {
        _liveMetrics.value = _liveMetrics.value.copy(activeBalancingMode = mode)
        logger.tunnel(TAG, "MasterDnsVPN balancing mode set: ${mode.modeName} (${mode.titlePersian})")
    }

    fun setTcpCarrier(carrier: MasterDnsTcpCarrier) {
        _liveMetrics.value = _liveMetrics.value.copy(activeCarrier = carrier)
        logger.tunnel(TAG, "MasterDnsVPN TCP Carrier set: ${carrier.protocolName} (${carrier.titlePersian})")
    }

    /**
     * Fail-closed probe: without a real resolver backend this does not invent
     * ping/query counts. It returns the config unchanged (with an honest log).
     */
    fun probeResolvers(config: MasterDnsConfig): MasterDnsConfig {
        logger.warn(TAG, "MasterDns probe requested, but no real resolver backend is wired; ping/query counts NOT fabricated.")
        return config.copy(
            resolvers = config.resolvers.map { it.copy(isAlive = false, measured = false) },
            backendUnavailable = true,
            backendNote = "No real resolver probe backend wired; no ping/query results generated."
        )
    }

    companion object {
        @Volatile
        private var instance: MasterDnsEngine? = null

        fun getInstance(context: Context): MasterDnsEngine {
            return instance ?: synchronized(this) {
                instance ?: MasterDnsEngine(context.applicationContext).also { instance = it }
            }
        }
    }
}
