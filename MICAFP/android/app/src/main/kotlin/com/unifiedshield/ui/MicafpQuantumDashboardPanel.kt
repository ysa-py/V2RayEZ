package com.unifiedshield.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.unifiedshield.micafp.DiagnosticTelemetryService
import com.unifiedshield.micafp.EbpfSocketFilterEngine
import com.unifiedshield.micafp.MicafpKernelRingBufferEngine
import com.unifiedshield.micafp.MicafpQuantumMorphProtocol
import com.unifiedshield.micafp.OnDeviceNeuralReconEngine
import com.unifiedshield.micafp.TfLitePacketAnalyzerEngine
import com.unifiedshield.ui.components.CyberHudCard
import com.unifiedshield.ui.components.EnterpriseStatusPill
import com.unifiedshield.ui.components.StatusPillType

/**
 * MICAFP Quantum/Host-offload dashboard.
 *
 * ANTI-FABRICATION (2026-09-04): This panel previously displayed fictitious
 * Kyber-1024, eBPF pps, ring-buffer usage, JA4 inference, TFLite entropy/IAT and
 * DPI-probe probabilities generated from `Random`. Those numbers have been
 * removed. The panel now renders honest `UNAVAILABLE` states until a real
 * backend supplies measured values.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MicafpQuantumDashboardPanel(
    isConnected: Boolean
) {
    val qmpEngine = remember { MicafpQuantumMorphProtocol.getInstance() }
    val kernelEngine = remember { MicafpKernelRingBufferEngine.getInstance() }
    val neuralEngine = remember { OnDeviceNeuralReconEngine.getInstance() }
    val telemetryService = remember { DiagnosticTelemetryService.getInstance() }
    val tfLiteEngine = remember { TfLitePacketAnalyzerEngine.getInstance() }
    val ebpfEngine = remember { EbpfSocketFilterEngine.getInstance() }

    val qmpState by qmpEngine.qmpState.collectAsState()
    val ringBufferStats by kernelEngine.ringBufferStats.collectAsState()
    val neuralState by neuralEngine.neuralState.collectAsState()
    val telemetryState by telemetryService.telemetryState.collectAsState()
    val tfLiteMetrics by tfLiteEngine.inferenceMetrics.collectAsState()
    val ebpfStatus by ebpfEngine.ebpfStatus.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .testTag("micafp_quantum_dashboard_panel"),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // 1. Post-Quantum Cryptography & QMP Status
        CyberHudCard {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(
                        Icons.Default.VpnKey,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                    Column {
                        Text(
                            "QMP / Post-Quantum Offload",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            if (qmpState.backendUnavailable) "backend not wired — no quantum state claimed" else qmpState.backendNote,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                EnterpriseStatusPill(
                    text = if (qmpState.backendUnavailable) "UNAVAILABLE" else "ACTIVE",
                    type = if (qmpState.backendUnavailable) StatusPillType.WARNING else StatusPillType.SUCCESS
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                DashboardMetric(
                    label = "Quantum seed",
                    value = if (qmpState.currentQuantumSeed.isBlank()) "unavailable" else qmpState.currentQuantumSeed.take(10)
                )
                DashboardMetric(
                    label = "Mutation rate",
                    value = if (qmpState.mutationRateHz > 0) "${qmpState.mutationRateHz} Hz" else "unavailable"
                )
                DashboardMetric(
                    label = "Processing overhead",
                    value = if (qmpState.processingOverheadMs > 0f) "${qmpState.processingOverheadMs} ms" else "unavailable"
                )
            }
        }

        // 2. Kernel Zero-Copy Ring Buffer & eBPF Offload
        CyberHudCard {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    Text(
                        "Kernel Ring Buffer + eBPF Offload",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        if (ringBufferStats.backendUnavailable) ringBufferStats.backendNote else "Measured ring-buffer stats",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                EnterpriseStatusPill(
                    text = if (ringBufferStats.backendUnavailable) "UNAVAILABLE" else "MEASURED",
                    type = if (ringBufferStats.backendUnavailable) StatusPillType.WARNING else StatusPillType.SUCCESS
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                DashboardMetric(label = "eBPF filter hits", value = if (ringBufferStats.eBpFFilterHits > 0) "${ringBufferStats.eBpFFilterHits} pkts" else "unavailable")
                DashboardMetric(label = "Ring buffer usage", value = if (ringBufferStats.ringBufferUsagePct > 0) "${ringBufferStats.ringBufferUsagePct}%" else "unavailable")
            }

            Spacer(modifier = Modifier.height(6.dp))
            HonestNote(
                note = if (ebpfStatus.backendUnavailable) ebpfStatus.backendNote else ebpfStatus.backendNote
            )
        }

        // 3. TLS JA4 Fingerprint Morphing
        CyberHudCard {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    Text(
                        "TLS JA4 Fingerprint Selection",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        "Manual pool selection only — not fabricated ML inference",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                OutlinedButton(
                    onClick = { neuralEngine.morphJa4Fingerprint() },
                    shape = RoundedCornerShape(6.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                    modifier = Modifier.height(28.dp)
                ) {
                    Text("Select JA4", style = MaterialTheme.typography.labelSmall)
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HonestNote(note = neuralState.backendNote)
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(6.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(8.dp)) {
                    Text("Selected JA4 fingerprint:", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        neuralState.activeJa4Fingerprint.ifBlank { "not selected" },
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        // 4. Packet analyzer / TFLite
        CyberHudCard {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    Text(
                        "Packet Analyzer (TFLite-compatible)",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        if (tfLiteMetrics.backendUnavailable) tfLiteMetrics.backendNote else "Measured packet-window classification",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                EnterpriseStatusPill(
                    text = if (tfLiteMetrics.backendUnavailable) "UNAVAILABLE" else "MEASURED",
                    type = if (tfLiteMetrics.backendUnavailable) StatusPillType.WARNING else StatusPillType.SUCCESS
                )
            }

            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                DashboardMetric(label = "Payload entropy", value = if (tfLiteMetrics.payloadEntropyBits > 0f) "${tfLiteMetrics.payloadEntropyBits} bits/B" else "unavailable")
                DashboardMetric(label = "Inter-arrival time", value = if (tfLiteMetrics.interArrivalTimingUs > 0L) "${tfLiteMetrics.interArrivalTimingUs} µs" else "unavailable")
                DashboardMetric(label = "DPI probe probability", value = if (tfLiteMetrics.dpiProbingProbability > 0f) "${(tfLiteMetrics.dpiProbingProbability * 100).toInt()}%" else "unavailable")
            }
        }

        // 5. Diagnostic telemetry
        CyberHudCard {
            Text(
                "Diagnostic Telemetry",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(6.dp))
            HonestNote(
                note = if (telemetryState.backendUnavailable) telemetryState.backendNote else "Real diagnostic telemetry available."
            )
        }
    }
}

@Composable
private fun RowScope.DashboardMetric(label: String, value: String) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.weight(1f)
    ) {
        Column(modifier = Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

@Composable
private fun HonestNote(note: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(6.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp))
            .padding(8.dp)
    ) {
            Text(
                note,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
    }
}
