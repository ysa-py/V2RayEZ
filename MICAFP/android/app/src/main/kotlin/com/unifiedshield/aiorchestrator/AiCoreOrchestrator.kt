package com.unifiedshield.aiorchestrator

import android.util.Log
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

/**
 * Autonomous AI Core Orchestrator.
 *
 * ANTI-FABRICATION (2026-09-04): The default core pool previously shipped with
 * hard-coded fabricated scores, latencies and handshake rates (e.g. 96.5 pts,
 * 11-21ms). This build keeps the genuine retry/backoff/blacklist scheduler, but
 * starts with an honest pool: known core identifiers with zero scored metrics
 * and `backendUnavailable=true` until a real probe supplies measurements.
 */
class AiCoreOrchestrator private constructor() {

    private val TAG = "AiCoreOrchestrator"
    private val logger = DebugLogger.getInstance()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _coresPool = MutableStateFlow<List<CoreScoreEntry>>(getInitialCoresPool())
    val coresPool: StateFlow<List<CoreScoreEntry>> = _coresPool.asStateFlow()

    private val _backendUnavailable = MutableStateFlow(true)
    val backendUnavailable: StateFlow<Boolean> = _backendUnavailable.asStateFlow()

    private val _activeCoreId = MutableStateFlow("core-vless-reality")
    val activeCoreId: StateFlow<String> = _activeCoreId.asStateFlow()

    private val _orchestratorLogs = MutableStateFlow<List<String>>(
        listOf(
            "AI Orchestrator initialized. Multi-core pool known, but no real probe has measured it.",
            "Scoring matrix starts unavailable; real probes must supply scores."
        )
    )
    val orchestratorLogs: StateFlow<List<String>> = _orchestratorLogs.asStateFlow()

    private var retryAttempt = 0
    private var isSwitchingCore = false

    private fun getInitialCoresPool(): List<CoreScoreEntry> {
        return listOf(
            CoreScoreEntry("core-vless-reality", "VLESS Reality (XTLS-Vision)", "VLESS / TLS 1.3", 0.0, 0, 0.0, 0.0, 0.0, isActive = true),
            CoreScoreEntry("core-hysteria-2", "Hysteria 2 Brutal", "QUIC / UDP", 0.0, 0, 0.0, 0.0, 0.0),
            CoreScoreEntry("core-tuic-v5", "TUIC v5 Pure BBR", "QUIC / UDP", 0.0, 0, 0.0, 0.0, 0.0),
            CoreScoreEntry("core-storm-dns", "StormDNS Stream", "TCP-over-DNS", 0.0, 0, 0.0, 0.0, 0.0),
            CoreScoreEntry("core-cotten-dns", "CottenDNS Super-FEC", "Multi-Transport DNS", 0.0, 0, 0.0, 0.0, 0.0),
            CoreScoreEntry("core-master-dns", "MasterDns 8-Way ARQ", "DNS Multipath", 0.0, 0, 0.0, 0.0, 0.0),
            CoreScoreEntry("core-shadowsocks", "Shadowsocks 2022 Blake3", "AEAD", 0.0, 0, 0.0, 0.0, 0.0),
            CoreScoreEntry("core-amnezia-wg", "AmneziaWG Junk Obfuscated", "WireGuard UDP", 0.0, 0, 0.0, 0.0, 0.0),
            CoreScoreEntry("core-naive", "NaïveProxy Chromium Stack", "HTTP/2 TLS", 0.0, 0, 0.0, 0.0, 0.0)
        )
    }

    /**
     * Compute exponential backoff in milliseconds: base * 2^attempt + jitter.
     * The jitter is genuine scheduling jitter, not telemetry fabrication.
     */
    fun calculateBackoffMs(attempt: Int): Long {
        val base = 500L
        val maxBackoff = 8000L
        val exp = 2.0.pow(attempt.toDouble()).toLong()
        val calculated = min(maxBackoff, base * exp)
        val jitter = Random.nextLong(100, 400)
        return calculated + jitter
    }

    /**
     * Report a handshake failure for a specific core.
     * If failures reach 3 consecutive attempts, automatically blacklist the core for 5 minutes (300,000 ms)
     * and shift traffic to the next highest-scoring available core.
     */
    fun reportHandshakeFailure(coreId: String, reason: String) {
        scope.launch {
            val now = System.currentTimeMillis()
            val list = _coresPool.value.map { entry ->
                if (entry.coreId == coreId) {
                    val newFailures = entry.consecutiveFailures + 1
                    val shouldBlacklist = newFailures >= 3
                    val blacklistUntil = if (shouldBlacklist) now + (5 * 60 * 1000L) else entry.blacklistedUntilMs

                    if (shouldBlacklist) {
                        logger.warn("AiOrchestrator", "Core [$coreId] failed 3 consecutive handshakes. BLACKLISTED for 5 minutes.")
                        addLog("⛔ Core [${entry.name}] blacklisted for 5 minutes after 3 failed handshakes.")
                    } else {
                        logger.info("AiOrchestrator", "Core [$coreId] handshake failure #$newFailures ($reason)")
                        addLog("⚠️ Core [${entry.name}] handshake attempt #$newFailures failed: $reason")
                    }

                    entry.copy(
                        consecutiveFailures = newFailures,
                        isBlacklisted = shouldBlacklist,
                        blacklistedUntilMs = blacklistUntil,
                        score = (entry.score - 15.0).coerceAtLeast(10.0)
                    )
                } else {
                    entry
                }
            }
            _coresPool.value = list

            if (coreId == _activeCoreId.value) {
                retryAttempt++
                val backoff = calculateBackoffMs(retryAttempt)
                addLog("⏳ Exponential backoff delay ${backoff}ms before shifting core...")
                delay(backoff)
                autoShiftToBestCore("Consecutive failure on $coreId")
            }
        }
    }

    /**
     * Report successful handshake on core, resetting failure count.
     */
    fun reportHandshakeSuccess(coreId: String, latencyMs: Long) {
        scope.launch {
            retryAttempt = 0
            val list = _coresPool.value.map { entry ->
                if (entry.coreId == coreId) {
                    entry.copy(
                        consecutiveFailures = 0,
                        isBlacklisted = false,
                        blacklistedUntilMs = 0L,
                        latencyMs = latencyMs,
                        handshakeSuccessRate = ((entry.handshakeSuccessRate * 4) + 1.0) / 5.0,
                        backendUnavailable = false,
                        backendNote = "Real handshake observation recorded."
                    )
                } else entry
            }
            _coresPool.value = list
        }
    }

    /**
     * Automatically shifts traffic to the next highest-scoring available core
     * that has already received real probe/handshake data.
     */
    fun autoShiftToBestCore(triggerReason: String): CoreScoreEntry? {
        val now = System.currentTimeMillis()
        val currentActive = _activeCoreId.value

        val available = _coresPool.value
            .map { entry ->
                if (entry.isBlacklisted && now >= entry.blacklistedUntilMs) {
                    entry.copy(isBlacklisted = false, consecutiveFailures = 0)
                } else entry
            }
            .filter { it.isAvailable(now) && it.coreId != currentActive && !it.backendUnavailable }
            .sortedByDescending { it.score }

        val bestCandidate = available.firstOrNull()

        if (bestCandidate == null) {
            logger.warn(TAG, "AUTO-SHIFT requested ($triggerReason), but no real-scored candidate is available.")
            addLog("⚠️ Auto-shift requested, but no real-scored candidate is available.")
            return null
        }

        _activeCoreId.value = bestCandidate.coreId
        val updatedList = _coresPool.value.map { entry ->
            entry.copy(isActive = entry.coreId == bestCandidate.coreId)
        }
        _coresPool.value = updatedList

        logger.info("AiOrchestrator", "AUTO-SHIFTED traffic to [${bestCandidate.name}] (Score: ${bestCandidate.score}, Latency: ${bestCandidate.latencyMs}ms). Reason: $triggerReason")
        addLog("🚀 Auto-shifted traffic to [${bestCandidate.name}] (Score: ${bestCandidate.score}). Reason: $triggerReason")
        return bestCandidate
    }

    /**
     * Updates the full scoring matrix provided by a real profiler.
     */
    fun updateScoringMatrix(updatedScores: List<CoreScoreEntry>) {
        val now = System.currentTimeMillis()
        val currentActive = _activeCoreId.value

        val merged = updatedScores.map { updated ->
            val existing = _coresPool.value.find { it.coreId == updated.coreId }
            if (existing != null && existing.isBlacklisted && now < existing.blacklistedUntilMs) {
                updated.copy(
                    isBlacklisted = true,
                    blacklistedUntilMs = existing.blacklistedUntilMs,
                    consecutiveFailures = existing.consecutiveFailures,
                    isActive = updated.coreId == currentActive
                )
            } else {
                updated.copy(isActive = updated.coreId == currentActive)
            }
        }
        _coresPool.value = merged
        _backendUnavailable.value = merged.all { it.backendUnavailable }
    }

    private fun addLog(message: String) {
        val time = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
        val entry = "[$time] $message"
        val current = _orchestratorLogs.value.toMutableList()
        current.add(0, entry)
        if (current.size > 50) current.removeAt(current.size - 1)
        _orchestratorLogs.value = current
    }

    companion object {
        @Volatile
        private var INSTANCE: AiCoreOrchestrator? = null

        fun getInstance(): AiCoreOrchestrator {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: AiCoreOrchestrator().also { INSTANCE = it }
            }
        }
    }
}
