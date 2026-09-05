package com.unifiedshield.micafp

import android.util.Log
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * PROJECT MICAFP — eBPF Kernel Socket Interception & Zero-Copy Redirection Module.
 *
 * ANTI-FABRICATION (2026-09-04): This class previously reported hardcoded
 * `isEbpfAttached=true`, a made-up ring-buffer fd, and `Math.random`-style
 * synthetic packet/latency counters, and `attachSocketFilter()` returned `true`
 * without ever attaching a real BPF program. That is exactly the
 * fabricated-telemetry failure mode this project rejects.
 *
 * Correct behavior now:
 *   - The engine is honest about whether a real eBPF backend is attached: the
 *     default state is `backendUnavailable=true` and every counter is `0`.
 *   - `attachSocketFilter(socketFd)` never fabricates success. Without a real
 *     native kernel attach path it returns `false`, logs an explicit "not
 *     attached" event, and leaves all counters untouched.
 *   - No background thread simulates kernel counters.
 *
 * Integrators must replace `attachSocketFilter` with the real syscall/BPF attach
 * and feed counters from the native ring buffer. Until that backend exists, the
 * UI shows "unavailable" rather than trusting this class's numbers.
 */
class EbpfSocketFilterEngine private constructor() {

    private val TAG = "EbpfSocketFilter"
    private val logger = DebugLogger.getInstance()

    private val _ebpfStatus = MutableStateFlow(
        EbpfKernelModuleStatus(
            isEbpfAttached = false,
            attachedCgroup = "",
            zeroCopyRingBufferFd = -1,
            redirectedPacketsTotal = 0L,
            kernelStackBypassLatencyNs = 0L,
            activeSockMapEntries = 0,
            backendUnavailable = true,
            backendNote = "No real eBPF kernel backend is attached; counters are unavailable."
        )
    )
    val ebpfStatus: StateFlow<EbpfKernelModuleStatus> = _ebpfStatus.asStateFlow()

    /**
     * Attaches an eBPF program to the target socket FD. Fail-closed: without a
     * real native attach result this returns false and never updates counters.
     */
    fun attachSocketFilter(socketFd: Int): Boolean {
        logger.warn(TAG, "attachSocketFilter requested for fd=$socketFd but no real BPF attach backend is wired; refusing to report success.")
        val current = _ebpfStatus.value
        _ebpfStatus.value = current.copy(
            isEbpfAttached = false,
            backendUnavailable = true,
            backendNote = "Real eBPF kernel attachment is not available on this build; attachSocketFilter did not succeed."
        )
        return false
    }

    companion object {
        @Volatile
        private var INSTANCE: EbpfSocketFilterEngine? = null

        fun getInstance(): EbpfSocketFilterEngine {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: EbpfSocketFilterEngine().also { INSTANCE = it }
            }
        }
    }
}

data class EbpfKernelModuleStatus(
    val isEbpfAttached: Boolean,
    val attachedCgroup: String,
    val zeroCopyRingBufferFd: Int,
    val redirectedPacketsTotal: Long,
    val kernelStackBypassLatencyNs: Long,
    val activeSockMapEntries: Int,
    val backendUnavailable: Boolean = true,
    val backendNote: String = ""
)
