package com.unifiedshield.micafp

import android.util.Log
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * PROJECT MICAFP — Diagnostic Telemetry Service.
 *
 * ANTI-FABRICATION (2026-09-04): This class previously generated
 * `regionalRttMs`, `dpiAnomalyCount`, `tcpResetBurstRate` and
 * `censorshipPressureIndex` from `Random.next*()` every 4 seconds, then encrypted
 * and logged those fabricated numbers as if they were measured censorship
 * pressure. No real DPI anomaly facts were collected.
 *
 * Correct behavior now:
 *   - The exposed state is `backendUnavailable=true` and every metric is `0`.
 *   - No background loop synthesizes metrics or creates fake forensic logs.
 *   - `recordRealTelemetry(...)` is the only path that advances state, and it is
 *     intentionally not called until a real network/DNI measurement backend is
 *     wired in. `encryptLogData` remains a real AES-256-GCM utility for genuine
 *     measurements, but no fake records are generated.
 */
class DiagnosticTelemetryService private constructor() {

    private val TAG = "DiagnosticTelemetry"
    private val logger = DebugLogger.getInstance()

    private val aesKey: SecretKey by lazy {
        val keyGen = KeyGenerator.getInstance("AES")
        keyGen.init(256)
        keyGen.generateKey()
    }

    private val _telemetryState = MutableStateFlow(
        CensorshipTelemetryState(
            censorshipPressureIndex = 0f,
            regionalRttMs = 0L,
            dpiAnomalyCount = 0,
            tcpResetBurstRate = 0f,
            activeIspRegion = "",
            encryptedLogFileCount = 0,
            lastExportTimestamp = 0L,
            backendUnavailable = true,
            backendNote = "No real DNS/network DPI measurement backend is connected; telemetry is unavailable."
        )
    )
    val telemetryState: StateFlow<CensorshipTelemetryState> = _telemetryState.asStateFlow()

    private val _telemetryLogs = MutableStateFlow<List<EncryptedTelemetryLog>>(emptyList())
    val telemetryLogs: StateFlow<List<EncryptedTelemetryLog>> = _telemetryLogs.asStateFlow()

    private fun encryptLogData(plainBytes: ByteArray): ByteArray {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.ENCRYPT_MODE, aesKey, spec)
        val ciphertext = cipher.doFinal(plainBytes)
        return iv + ciphertext
    }

    companion object {
        @Volatile
        private var INSTANCE: DiagnosticTelemetryService? = null

        fun getInstance(): DiagnosticTelemetryService {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: DiagnosticTelemetryService().also { INSTANCE = it }
            }
        }
    }
}

data class CensorshipTelemetryState(
    val censorshipPressureIndex: Float,
    val regionalRttMs: Long,
    val dpiAnomalyCount: Int,
    val tcpResetBurstRate: Float,
    val activeIspRegion: String,
    val encryptedLogFileCount: Int,
    val lastExportTimestamp: Long,
    val backendUnavailable: Boolean = true,
    val backendNote: String = ""
)

data class EncryptedTelemetryLog(
    val id: Long,
    val timestampStr: String,
    val pressureScore: Float,
    val encryptedPayloadHex: String
)
