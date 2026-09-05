package com.unifiedshield

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class DpiDiagnosticItem(
    val id: String,
    val title: String,
    val titlePersian: String,
    val targetSignature: String,
    val isBlocked: Boolean,
    val latencyMs: Long,
    val statusText: String,
    val statusTextPersian: String,
    val recommendedCure: String,
    val isTesting: Boolean = false,
    val backendUnavailable: Boolean = true,
    val backendNote: String = "No real DPI probe is wired in; result is unavailable."
)

data class DpiDiagnosticSummary(
    val overallDpiThreatLevel: String = "UNKNOWN",
    val overallDpiThreatLevelPersian: String = "نامشخص",
    val bypassHealthScore: Int = 0,
    val ispName: String = "",
    val activeCureApplied: String = "none",
    val isRunningTest: Boolean = false,
    val backendUnavailable: Boolean = true,
    val backendNote: String = "No real DPI probe wire is connected; test results are unavailable."
)

class DpiDiagnosticEngine private constructor() {

    private val _summary = MutableStateFlow(DpiDiagnosticSummary())
    val summary: StateFlow<DpiDiagnosticSummary> = _summary

    private val _diagnosticItems = MutableStateFlow<List<DpiDiagnosticItem>>(
        listOf(
            DpiDiagnosticItem(
                id = "sni-probe",
                title = "SNI Header Inspection",
                titlePersian = "بازرسی سرآیند نام دامنه (SNI Inspection)",
                targetSignature = "Unavailable — probe not wired",
                isBlocked = false,
                latencyMs = 0,
                statusText = "UNAVAILABLE",
                statusTextPersian = "در دسترس نیست",
                recommendedCure = "Wire a real SNI probe before reporting a result"
            ),
            DpiDiagnosticItem(
                id = "dns-poison",
                title = "DNS Hijacking & Poisoning",
                titlePersian = "مسموم‌سازی و انحراف DNS (DNS Poisoning)",
                targetSignature = "Unavailable — probe not wired",
                isBlocked = false,
                latencyMs = 0,
                statusText = "UNAVAILABLE",
                statusTextPersian = "در دسترس نیست",
                recommendedCure = "Wire a real DNS query probe before reporting a result"
            ),
            DpiDiagnosticItem(
                id = "udp-throttle",
                title = "UDP QoS Throttling & Drop",
                titlePersian = "محدودیت و افت عمدی ترافیک UDP (UDP Throttling)",
                targetSignature = "Unavailable — probe not wired",
                isBlocked = false,
                latencyMs = 0,
                statusText = "UNAVAILABLE",
                statusTextPersian = "در دسترس نیست",
                recommendedCure = "Wire a real UDP probe before reporting a result"
            ),
            DpiDiagnosticItem(
                id = "ml-classifier",
                title = "AI Packet Length & Flow ML Classifier",
                titlePersian = "مدل‌های یادگیری ماشین تشخیص الگو (ML Classifier)",
                targetSignature = "Unavailable — probe not wired",
                isBlocked = false,
                latencyMs = 0,
                statusText = "UNAVAILABLE",
                statusTextPersian = "در دسترس نیست",
                recommendedCure = "Wire a real ML classifier probe before reporting a result"
            )
        )
    )
    val diagnosticItems: StateFlow<List<DpiDiagnosticItem>> = _diagnosticItems

    /**
     * Placeholder for a live diagnostic run. The real probe/backend is not wired
     * in, so it marks the run as unavailable instead of fabricating latencies and
     * a bypass-health score.
     */
    fun runLiveDiagnostic() {
        if (_summary.value.isRunningTest) return
        _summary.value = _summary.value.copy(isRunningTest = true)

        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Default).launch {
            delay(300)
            val unavailableList = _diagnosticItems.value.map {
                it.copy(isTesting = false, isBlocked = false, latencyMs = 0)
            }
            _diagnosticItems.value = unavailableList

            _summary.value = _summary.value.copy(
                isRunningTest = false,
                bypassHealthScore = 0,
                activeCureApplied = "none",
                backendUnavailable = true,
                backendNote = "Live diagnostic completed with no real probe connected; no result generated."
            )
        }
    }

    companion object {
        @Volatile
        private var instance: DpiDiagnosticEngine? = null

        fun getInstance(): DpiDiagnosticEngine {
            return instance ?: synchronized(this) {
                instance ?: DpiDiagnosticEngine().also { instance = it }
            }
        }
    }
}
