package com.unifiedshield.whitedns

import android.content.Context
import android.os.Environment
import com.unifiedshield.logging.DebugLogger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class WhiteDnsScannerEngine private constructor(private val context: Context) {

    private val TAG = "WhiteDnsScannerEngine"
    private val logger = DebugLogger.getInstance()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var scanJob: Job? = null

    val embeddedAsnDatasets = listOf(
        WhiteDnsAsnDataset(
            asn = "AS13335",
            organization = "Cloudflare, Inc.",
            country = "US / Global Anycast",
            defaultCidrs = listOf("104.16.0.0/16", "104.21.0.0/16", "172.64.0.0/13", "162.158.0.0/15", "198.41.128.0/17"),
            totalIps = 1572864
        ),
        WhiteDnsAsnDataset(
            asn = "AS54113",
            organization = "Fastly, Inc.",
            country = "US / Global Anycast",
            defaultCidrs = listOf("151.101.0.0/16", "199.232.0.0/16"),
            totalIps = 131072
        ),
        WhiteDnsAsnDataset(
            asn = "AS16509",
            organization = "Amazon.com (CloudFront)",
            country = "Global AWS Edge",
            defaultCidrs = listOf("13.32.0.0/15", "18.64.0.0/14", "99.84.0.0/16"),
            totalIps = 524288
        ),
        WhiteDnsAsnDataset(
            asn = "AS199524",
            organization = "Gcore S.A.",
            country = "LU / Middle East CDN",
            defaultCidrs = listOf("92.223.80.0/20", "92.38.168.0/21"),
            totalIps = 6144
        ),
        WhiteDnsAsnDataset(
            asn = "AS45102",
            organization = "Alibaba Cloud Computing",
            country = "CN / HK / SG",
            defaultCidrs = listOf("47.74.0.0/16", "47.88.0.0/16", "8.208.0.0/15"),
            totalIps = 262144
        )
    )

    private val _state = MutableStateFlow(WhiteDnsScannerState())
    val state: StateFlow<WhiteDnsScannerState> = _state

    fun recordRealScanResult(result: WhiteDnsScanResult) {
        val list = _state.value.results.toMutableList()
        list.add(0, result)
        _state.value = _state.value.copy(
            results = list,
            cleanTargetsFound = list.count { it.isClean },
            scannedTargets = _state.value.scannedTargets + 1,
            backendUnavailable = false,
            backendNote = "Real WhiteDNS probe result recorded."
        )
    }

    fun updateScanType(type: WhiteDnsScanType) {
        _state.value = _state.value.copy(selectedScanType = type)
    }

    fun updateScanDepth(depth: WhiteDnsScanDepth) {
        _state.value = _state.value.copy(scanDepth = depth)
    }

    fun updateInputCidr(cidr: String) {
        _state.value = _state.value.copy(inputCidrOrDomain = cidr)
    }

    fun updateConcurrency(workers: Int) {
        _state.value = _state.value.copy(concurrencyWorkers = workers.coerceIn(4, 64))
    }

    fun updateActiveProtocol(protocol: WhiteDnsDnsProtocol) {
        _state.value = _state.value.copy(activeProtocol = protocol)
    }

    /**
     * Fail-closed scan start. With no real WhiteDNS probe backend wired, this
     * computes the target list then completes with `results=[]` and an honest
     * unavailable message rather than fabricating clean-node results.
     */
    fun startScan() {
        if (_state.value.isScanning && !_state.value.isPaused) return

        if (_state.value.isPaused) {
            _state.value = _state.value.copy(isPaused = false)
            logger.addLog("WhiteDNS Scanner", "Resumed scanning operations (still no real probe backend).")
            return
        }

        scanJob?.cancel()
        _state.value = _state.value.copy(
            isScanning = true,
            isPaused = false,
            scannedTargets = 0,
            cleanTargetsFound = 0,
            progressPercentage = 0f,
            totalTargets = 0,
            results = emptyList(),
            exportStatusMessage = null,
            backendUnavailable = true,
            backendNote = "No real WhiteDNS probe backend is wired in; scan results are unavailable."
        )

        logger.addLog("WhiteDNS Scanner", "Starting ${_state.value.selectedScanType.label} with ${_state.value.concurrencyWorkers} workers on ${_state.value.inputCidrOrDomain}...")

        scanJob = scope.launch {
            val sampleTargets = generateScanTargets(_state.value.inputCidrOrDomain, _state.value.selectedScanType)
            val total = sampleTargets.size
            delay(80)
            _state.value = _state.value.copy(
                isScanning = false,
                isPaused = false,
                totalTargets = total,
                scannedTargets = 0,
                cleanTargetsFound = 0,
                currentScanningTarget = "No real probe backend wired; scan did not fabricate results.",
                currentSpeedPps = 0,
                progressPercentage = 0f,
                results = emptyList(),
                backendUnavailable = true
            )
            logger.addLog("WhiteDNS Scanner", "Scan request completed without a real probe backend; no results fabricated.")
        }
    }

    fun pauseScan() {
        if (_state.value.isScanning) {
            _state.value = _state.value.copy(isPaused = true)
            logger.addLog("WhiteDNS Scanner", "Scanner paused by user.")
        }
    }

    fun stopScan() {
        scanJob?.cancel()
        _state.value = _state.value.copy(
            isScanning = false,
            isPaused = false,
            currentScanningTarget = "اسکن توسط کاربر متوقف شد.",
            results = emptyList()
        )
        logger.addLog("WhiteDNS Scanner", "Scanner halted.")
    }

    fun generateScanTargets(input: String, type: WhiteDnsScanType): List<String> {
        val list = mutableListOf<String>()
        when (type) {
            WhiteDnsScanType.IP_CIDR, WhiteDnsScanType.DNS_RESOLVER -> {
                val base = if (input.contains("/")) input.substringBefore("/") else "104.21.68"
                val prefix = base.substringBeforeLast(".")
                for (i in 1..48) {
                    list.add("$prefix.$i")
                }
            }
            WhiteDnsScanType.SNI_SCANNER -> {
                list.addAll(
                    listOf(
                        "c.whatsapp.net", "speedtest.net", "dl.google.com",
                        "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "ajax.microsoft.com",
                        "static.cloudflareinsights.com", "gateway.icloud.com", "api.github.com"
                    )
                )
            }
            WhiteDnsScanType.HTTP_PROXY, WhiteDnsScanType.SOCKS5_PROXY -> {
                for (i in 10..35) {
                    list.add("104.16.132.$i:8080")
                }
            }
            WhiteDnsScanType.ASN_EXPORT -> {
                list.addAll(listOf("104.16.0.1", "104.21.1.1", "172.64.0.1", "151.101.1.1", "13.32.1.1"))
            }
        }
        return list
    }

    fun exportResults(format: WhiteDnsExportFormat): String {
        val sdf = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault())
        val timestamp = sdf.format(Date())
        val fileName = "whitedns_scan_$timestamp.${format.extension}"

        val content = when (format) {
            WhiteDnsExportFormat.JSON -> buildJsonExport(_state.value.results)
            WhiteDnsExportFormat.CSV -> buildCsvExport(_state.value.results)
            WhiteDnsExportFormat.TXT -> buildTxtExport(_state.value.results)
            WhiteDnsExportFormat.XLSX -> buildCsvExport(_state.value.results)
        }

        try {
            val localFile = File(context.cacheDir, fileName)
            localFile.writeText(content)

            val docsDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "WhiteDNS Scanner")
            if (!docsDir.exists()) {
                docsDir.mkdirs()
            }
            val pubFile = File(docsDir, fileName)
            pubFile.writeText(content)

            val msg = "فایل $fileName در پوشه Documents/WhiteDNS Scanner ذخیره شد (${_state.value.results.size} ردیف)."
            _state.value = _state.value.copy(exportStatusMessage = msg)
            logger.addLog("WhiteDNS Exporter", msg)
            return msg
        } catch (e: Exception) {
            val fallbackMsg = "نتایج در کش محلی برنامه ذخیره گردید ($fileName)."
            _state.value = _state.value.copy(exportStatusMessage = fallbackMsg)
            return fallbackMsg
        }
    }

    private fun buildJsonExport(results: List<WhiteDnsScanResult>): String {
        val sb = StringBuilder("[\n")
        results.forEachIndexed { index, item ->
            sb.append("  {\n")
            sb.append("    \"id\": \"${item.id}\",\n")
            sb.append("    \"target\": \"${item.target}\",\n")
            sb.append("    \"asn\": \"${item.asn}\",\n")
            sb.append("    \"org\": \"${item.org}\",\n")
            sb.append("    \"pingMs\": ${item.pingLatencyMs},\n")
            sb.append("    \"isClean\": ${item.isClean},\n")
            sb.append("    \"edns\": ${item.ednsBufferSize},\n")
            sb.append("    \"txtTunnel\": ${item.txtTunnelPassthrough},\n")
            sb.append("    \"score\": ${item.ratingScore}\n")
            sb.append(if (index == results.size - 1) "  }\n" else "  },\n")
        }
        sb.append("]")
        return sb.toString()
    }

    private fun buildCsvExport(results: List<WhiteDnsScanResult>): String {
        val sb = StringBuilder("Target,ASN,Organization,Latency_ms,Clean,EDNS_Buffer,TXT_Tunnel,Score\n")
        results.forEach { item ->
            sb.append("${item.target},${item.asn},\"${item.org}\",${item.pingLatencyMs},${item.isClean},${item.ednsBufferSize},${item.txtTunnelPassthrough},${item.ratingScore}\n")
        }
        return sb.toString()
    }

    private fun buildTxtExport(results: List<WhiteDnsScanResult>): String {
        val sb = StringBuilder("# WhiteDNS IP & DNS Scanner Export - Clean Targets\n")
        results.filter { it.isClean }.forEach { item ->
            sb.append("${item.target} # ${item.asn} - ${item.pingLatencyMs}ms - Score:${item.ratingScore}\n")
        }
        return sb.toString()
    }

    companion object {
        @Volatile
        private var instance: WhiteDnsScannerEngine? = null

        fun getInstance(context: Context): WhiteDnsScannerEngine {
            return instance ?: synchronized(this) {
                instance ?: WhiteDnsScannerEngine(context.applicationContext).also { instance = it }
            }
        }
    }
}
