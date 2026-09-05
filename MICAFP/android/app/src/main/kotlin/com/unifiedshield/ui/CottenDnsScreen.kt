package com.unifiedshield.ui

import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.unifiedshield.cottendns.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CottenDnsScreen() {
    val context = LocalContext.current
    val engine = remember { CottenDnsEngine.getInstance(context) }
    val state by engine.state.collectAsState()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("cottendns_screen"),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Hero Header Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, Color(0xFF10B981).copy(alpha = 0.4f)),
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    Color(0xFF059669).copy(alpha = 0.20f),
                                    Color(0xFF0F172A).copy(alpha = 0.95f)
                                )
                            )
                        )
                        .padding(18.dp)
                ) {
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(46.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF10B981).copy(alpha = 0.25f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Hub,
                                        contentDescription = null,
                                        tint = Color(0xFF34D399),
                                        modifier = Modifier.size(28.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        text = "CottenDNS Engine",
                                        fontSize = 17.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color.White
                                    )
                                    Text(
                                        text = "Adaptive Multi-Transport & Super-FEC Matrix",
                                        fontSize = 11.sp,
                                        color = Color(0xFFA7F3D0)
                                    )
                                }
                            }

                            Badge(containerColor = if (state.backendUnavailable) Color(0xFFB45309) else Color(0xFF10B981), contentColor = Color.White) {
                                Text(if (state.backendUnavailable) "UNAVAILABLE" else "Active Matrix", fontWeight = FontWeight.Bold)
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                            Text(
                                text = if (state.backendUnavailable)
                                    "CottenDNS کانفیگ‌ها آماده‌اند، اما هیچ بک‌اند واقعی متصل نیست؛ آمارها در دسترس نیستند و جعل نمی‌شوند."
                                else
                                    "موتور CottenDNS برای ارزیابی مستقل هر مسیر، کشف MTU، تصحیح خطای پیش‌رو و مسابقه با جعل DNS.",
                                fontSize = 12.sp,
                                color = Color(0xFFE2E8F0),
                                lineHeight = 18.sp
                            )

                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Badge(containerColor = Color(0xFF059669), contentColor = Color.White) {
                                Text("UDP/53 + TCP/53 + DoT + DoH")
                            }
                            Badge(containerColor = Color(0xFF3B82F6), contentColor = Color.White) {
                                Text("Anti-Poison Racing")
                            }
                        }
                    }
                }
            }
        }

        // Live Counters
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("بسته‌های بازیابی FEC:", fontSize = 10.sp, color = Color(0xFF94A3B8))
                        Text(if (state.backendUnavailable || state.fecFramesRecovered == 0L) "unavailable" else "${state.fecFramesRecovered}", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = if (state.backendUnavailable) Color(0xFFB45309) else Color(0xFF34D399))
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("جعل‌های خنثی شده:", fontSize = 10.sp, color = Color(0xFF94A3B8))
                        Text(if (state.backendUnavailable || state.poisonAttemptsDefeated == 0L) "unavailable" else "${state.poisonAttemptsDefeated}", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = if (state.backendUnavailable) Color(0xFFB45309) else Color(0xFF38BDF8))
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("بازتکرار فریم در پرواز:", fontSize = 10.sp, color = Color(0xFF94A3B8))
                        Text(if (state.backendUnavailable || state.inFlightFrameReplayCount == 0L) "unavailable" else "${state.inFlightFrameReplayCount}", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = if (state.backendUnavailable) Color(0xFFB45309) else Color(0xFFFBBF24))
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("بودجه ازدحام:", fontSize = 10.sp, color = Color(0xFF94A3B8))
                        Text(if (state.backendUnavailable || state.singleCongestionBudgetPct == 0) "unavailable" else "${state.singleCongestionBudgetPct}%", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }
        }

        // FEC Mode & Record Rotation Card
        item {
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("تنظیمات تصحیح خطای پیش‌رو (Forward Error Correction):", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        CottenFecMode.values().forEach { fec ->
                            FilterChip(
                                selected = state.fecMode == fec,
                                onClick = { engine.updateFecMode(fec) },
                                label = { Text(fec.label.split(" ").first(), fontSize = 10.sp) }
                            )
                        }
                    }

                    Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))

                    Text("چرخش پویای رکوردها علیه فیلترینگ هوشمند (Record Rotation):", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    CottenRecordRotation.values().forEach { rot ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            RadioButton(
                                selected = state.recordRotation == rot,
                                onClick = { engine.updateRecordRotation(rot) }
                            )
                            Text(rot.label, fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        // Feature Toggles Card
        item {
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("قابلیت‌های پیشرفته CottenDNS:", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("مسابقه سریع با پاسخ‌های جعلی (Anti-Poison Racing)", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text("تشخیص زودهنگام پاسخ غیرواقعی و درخواست همزمان از مسیر امن", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(
                            checked = state.earlyPoisonRacingEnabled,
                            onCheckedChange = { engine.toggleEarlyPoisonRacing(it) }
                        )
                    }

                    Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("استرایپ بسته‌ها روی مسیرهای برابر (Equal-Path Striping)", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text("توزیع ترافیک حجیم بدون ارسال نسخه‌های تکراری بیهوده", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(
                            checked = state.equalPathStripingEnabled,
                            onCheckedChange = { engine.toggleEqualPathStriping(it) }
                        )
                    }

                    Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("تغییر شکل ساختار QNAME (Label Reshaping)", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text("خنثی‌سازی شناسایی الگوهای متناوب توسط سامانه‌های فیلترینگ", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(
                            checked = state.qnameReshapingEnabled,
                            onCheckedChange = { engine.toggleQnameReshaping(it) }
                        )
                    }
                }
            }
        }

        // Path Matrix Header
        item {
            Text(
                text = "ماتریس مسیرهای چندگانه (Resolver × Transport Matrix):",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            )
        }

        // Paths List
        if (state.paths.isEmpty()) {
            item {
                Text(
                    "No real CottenDNS path measurements (backend not wired).",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        items(state.paths, key = { it.id }) { path ->
            Card(
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, if (path.measured && path.isCurrentlyActive) Color(0xFF10B981).copy(alpha = 0.6f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(
                                        when {
                                            !path.measured -> Color(0xFFB45309)
                                            path.isCurrentlyActive -> Color(0xFF10B981)
                                            else -> Color(0xFF94A3B8)
                                        }
                                    )
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "${path.resolver} (${path.transport.label.split(" ").first()})",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }

                        Badge(
                            containerColor = if (!path.measured) Color(0xFFB45309) else if (path.confidenceScore > 95) Color(0xFF10B981) else Color(0xFFF59E0B),
                            contentColor = Color.White
                        ) {
                            Text(if (path.measured) "اطمینان: ${path.confidenceScore}%" else "unmeasured")
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(if (path.measured) "ارسال (Upload): ${path.uploadDeliveryPct}%" else "unavailable", fontSize = 11.sp, color = if (path.measured) Color(0xFF10B981) else Color(0xFFB45309))
                        Text(if (path.measured) "دریافت (Download): ${path.downloadDeliveryPct}%" else "unavailable", fontSize = 11.sp, color = if (path.measured) Color(0xFF38BDF8) else Color(0xFFB45309))
                        Text(if (path.measured) "RTT: ${path.directionalRttMs}ms" else "unavailable", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text(if (path.measured) "MTU: ${path.pathMtu}B" else "unavailable", fontSize = 11.sp)
                    }
                }
            }
        }
    }
}
