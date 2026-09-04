package com.unifiedshield.stormdns

import android.content.Context
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * StormDNS TCP-over-DNS engine.
 *
 * ANTI-FABRICATION (2026-09-04): This class previously seeded four resolver nodes
 * with fabricated 12–21ms latency and a background loop that advanced Tx/Rx bytes,
 * ARQ retransmissions, dynamic RTO and stream count with `.random()`. No real
 * StormDNS tunnel/resolver backend ran.
 *
 * Correct behavior now:
 *   - Default state is `backendUnavailable=true`, no resolvers, zero counters.
 *   - Configuration setters remain; no measurement is synthesized.
 *   - `recordRealResolverSample(...)` / `recordRealCounters(...)` accept measured data.
 */
class StormDnsEngine private constructor(private val context: Context) {

    private val TAG = "StormDnsEngine"
    private val logger = DebugLogger.getInstance()

    private val _state = MutableStateFlow(StormDnsState())
    val state: StateFlow<StormDnsState> = _state

    init {
        logger.addLog("StormDNS Core", "Engine initialized fail-closed; no real resolver backend wired.")
    }

    fun recordRealResolverSample(sample: StormDnsResolverNode) {
        if (!sample.measured) {
            logger.addLog("StormDNS Core", "Refused unmeasured resolver sample; no telemetry fabricated.")
            return
        }
        _state.value = _state.value.copy(
            resolvers = listOf(sample) + _state.value.resolvers.filter { it.id != sample.id },
            backendUnavailable = false,
            backendNote = "Real StormDNS resolver sample recorded."
        )
    }

    fun recordRealCounters(bytesTx: Long, bytesRx: Long, arqRetx: Long, rtoMs: Int, streams: Int) {
        _state.value = _state.value.copy(
            bytesTransmitted = bytesTx,
            bytesReceived = bytesRx,
            arqRetransmissions = arqRetx,
            dynamicRtoMs = rtoMs,
            activeStreamsCount = streams,
            backendUnavailable = false,
            backendNote = "Real StormDNS counters recorded."
        )
    }

    fun toggleTunnel(start: Boolean) {
        if (start && _state.value.backendUnavailable) {
            _state.value = _state.value.copy(isTunnelRunning = false)
            logger.addLog("StormDNS Core", "Tunnel start refused: no real tunnel backend is wired; no fake running state.")
            return
        }
        _state.value = _state.value.copy(isTunnelRunning = start)
        if (start) {
            logger.addLog("StormDNS Core", "StormDNS tunnel started (real backend present).")
        } else {
            logger.addLog("StormDNS Core", "StormDNS tunnel listener stopped (request).")
        }
    }

    fun updateBalancing(balancing: StormDnsBalancing) {
        _state.value = _state.value.copy(balancing = balancing)
        logger.addLog("StormDNS Config", "Resolver balancing changed to: ${balancing.label}")
    }

    fun updateCompression(comp: StormDnsCompression) {
        _state.value = _state.value.copy(compression = comp)
    }

    fun updateCipher(cipher: StormDnsCipher) {
        _state.value = _state.value.copy(cipher = cipher)
    }

    fun updateEncoding(enc: StormDnsEncoding) {
        _state.value = _state.value.copy(encoding = enc)
    }

    fun updateDuplication(data: Int, ack: Int, setup: Int, control: Int) {
        _state.value = _state.value.copy(
            duplicationControls = StormDnsDuplicationControls(
                dataDuplication = data.coerceIn(1, 3),
                ackDuplication = ack.coerceIn(1, 4),
                setupDuplication = setup.coerceIn(2, 5),
                controlDuplication = control.coerceIn(1, 3)
            )
        )
    }

    fun updateMtu(mtu: Int) {
        _state.value = _state.value.copy(activeMtu = mtu.coerceIn(256, 1400))
    }

    fun updateTunnelDomain(domain: String) {
        _state.value = _state.value.copy(tunnelDomain = domain)
    }

    fun updateSocksPort(port: Int) {
        _state.value = _state.value.copy(localSocks5Port = port.coerceIn(1024, 65535))
    }

    companion object {
        @Volatile
        private var instance: StormDnsEngine? = null

        fun getInstance(context: Context): StormDnsEngine {
            return instance ?: synchronized(this) {
                instance ?: StormDnsEngine(context.applicationContext).also { instance = it }
            }
        }
    }
}
