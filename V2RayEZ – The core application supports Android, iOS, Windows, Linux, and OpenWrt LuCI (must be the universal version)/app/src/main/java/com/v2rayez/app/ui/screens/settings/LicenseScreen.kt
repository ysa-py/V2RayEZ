package com.v2rayez.app.ui.screens.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.v2rayez.app.R
import com.v2rayez.app.data.license.LicenseValidationResult
import com.v2rayez.app.ui.components.CardSurface
import com.v2rayez.app.ui.components.SectionHeader
import com.v2rayez.app.ui.components.SettingSwitchRow
import com.v2rayez.app.ui.components.V2BackTopBar
import com.v2rayez.app.ui.components.VSpacer
import com.v2rayez.app.ui.viewmodel.LicenseViewModel

@Composable
fun LicenseScreen(
    onBack: () -> Unit,
    viewModel: LicenseViewModel = hiltViewModel()
) {
    val config by viewModel.config.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val result by viewModel.result.collectAsState()
    var serial by remember { mutableStateOf("") }
    var accountId by remember { mutableStateOf(config.accountId) }
    var endpoint by remember { mutableStateOf(config.validationUrl) }
    var deviceLabel by remember { mutableStateOf(config.deviceLabel) }
    var publicKeyPem by remember { mutableStateOf(config.publicKeyPem) }
    var publicKeysJson by remember { mutableStateOf(config.publicKeysJson) }
    var deviceHashSalt by remember { mutableStateOf(config.deviceHashSalt) }
    var revocationPollSeconds by remember { mutableStateOf(config.revocationPollSeconds.toString()) }
    var initialized by remember { mutableStateOf(false) }

    LaunchedEffect(config) {
        if (!initialized) {
            accountId = config.accountId
            endpoint = config.validationUrl
            deviceLabel = config.deviceLabel
            publicKeyPem = config.publicKeyPem
            publicKeysJson = config.publicKeysJson
            deviceHashSalt = config.deviceHashSalt
            revocationPollSeconds = config.revocationPollSeconds.toString()
            initialized = true
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        V2BackTopBar(title = stringResource(R.string.license_title), onBack = onBack)
        Column(Modifier.padding(horizontal = 16.dp)) {
            SectionHeader(title = stringResource(R.string.license_status_section))
            StatusCard(
                result = result,
                lastResult = config.lastResult,
                lastReason = config.lastReason,
                expiresAt = config.expiresAt,
                graceUntil = config.offlineGraceUntil,
                lastServerTime = config.lastServerTime,
                redactedSerial = viewModel.redactedSerial,
                devicePreview = viewModel.deviceIdPreview,
                hasSerial = viewModel.hasSerial,
                busy = busy,
                onValidate = viewModel::validateNow
            )
            VSpacer(18)

            SectionHeader(title = stringResource(R.string.license_activation_section))
            CardSurface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = serial,
                        onValueChange = { serial = it.trim() },
                        label = { Text(stringResource(R.string.license_serial)) },
                        placeholder = { Text("eyJhbGci...") },
                        minLines = 3,
                        maxLines = 5,
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.None,
                            keyboardType = KeyboardType.Text
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = accountId,
                        onValueChange = { accountId = it.trim() },
                        label = { Text(stringResource(R.string.license_account_id)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = endpoint,
                        onValueChange = { endpoint = it.trim() },
                        label = { Text(stringResource(R.string.license_validation_url)) },
                        placeholder = { Text("https://dashboard.example.com") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = deviceLabel,
                        onValueChange = { deviceLabel = it },
                        label = { Text(stringResource(R.string.license_device_label)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = publicKeyPem,
                        onValueChange = { publicKeyPem = it },
                        label = { Text(stringResource(R.string.license_public_key_pem)) },
                        placeholder = { Text("-----BEGIN PUBLIC KEY-----") },
                        minLines = 2,
                        maxLines = 5,
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.None,
                            keyboardType = KeyboardType.Text
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = publicKeysJson,
                        onValueChange = { publicKeysJson = it },
                        label = { Text(stringResource(R.string.license_public_keys_json)) },
                        placeholder = { Text("{\"default\":\"-----BEGIN PUBLIC KEY-----...\"}") },
                        minLines = 2,
                        maxLines = 4,
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.None,
                            keyboardType = KeyboardType.Text
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = deviceHashSalt,
                        onValueChange = { deviceHashSalt = it.trim() },
                        label = { Text(stringResource(R.string.license_device_hash_salt)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = revocationPollSeconds,
                        onValueChange = { revocationPollSeconds = it.filter { ch -> ch.isDigit() }.take(3) },
                        label = { Text(stringResource(R.string.license_revocation_poll_seconds)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        text = stringResource(R.string.license_public_key_help),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    VSpacer(8)
                    SettingSwitchRow(
                        icon = Icons.Filled.CloudDone,
                        title = stringResource(R.string.license_offline_grace),
                        checked = config.allowOfflineGrace,
                        onCheckedChange = { enabled -> viewModel.updateConfig { it.copy(allowOfflineGrace = enabled) } },
                        subtitle = stringResource(R.string.license_offline_grace_sub)
                    )
                    VSpacer(12)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Button(
                            onClick = {
                                viewModel.activate(
                                    serial,
                                    accountId,
                                    endpoint,
                                    deviceLabel,
                                    publicKeyPem,
                                    publicKeysJson,
                                    deviceHashSalt,
                                    revocationPollSeconds
                                )
                            },
                            enabled = !busy
                        ) { Text(stringResource(R.string.license_activate)) }
                        Spacer(Modifier.width(10.dp))
                        OutlinedButton(
                            onClick = {
                                viewModel.updateConfig {
                                    it.copy(
                                        accountId = accountId.trim(),
                                        validationUrl = endpoint.trim(),
                                        deviceLabel = deviceLabel.trim(),
                                        publicKeyPem = publicKeyPem.trim(),
                                        publicKeysJson = publicKeysJson.trim(),
                                        deviceHashSalt = deviceHashSalt.trim().ifBlank { "v2rayez-client-device-binding-v1" },
                                        revocationPollSeconds = revocationPollSeconds.toIntOrNull()?.coerceIn(5, 300) ?: 10
                                    )
                                }
                            },
                            enabled = !busy
                        ) { Text(stringResource(R.string.action_save)) }
                        Spacer(Modifier.width(10.dp))
                        OutlinedButton(
                            onClick = viewModel::clearSerial,
                            enabled = !busy && viewModel.hasSerial
                        ) { Text(stringResource(R.string.action_delete)) }
                    }
                }
            }
            VSpacer(24)
        }
    }
}

@Composable
private fun StatusCard(
    result: LicenseValidationResult?,
    lastResult: String,
    lastReason: String,
    expiresAt: String,
    graceUntil: String,
    lastServerTime: String,
    redactedSerial: String,
    devicePreview: String,
    hasSerial: Boolean,
    busy: Boolean,
    onValidate: () -> Unit
) {
    val effectiveResult = result?.result ?: lastResult
    val effectiveReason = result?.reason ?: lastReason
    val effectiveExpires = result?.expiresAt?.ifBlank { expiresAt } ?: expiresAt
    val effectiveGrace = result?.offlineGraceUntil?.ifBlank { graceUntil } ?: graceUntil
    val effectiveServerTime = result?.serverTime?.ifBlank { lastServerTime } ?: lastServerTime
    val allowed = result?.allowed ?: (effectiveResult == "ALLOWED")
    val notValidated = stringResource(R.string.license_not_validated)
    val reasonText = effectiveReason.ifBlank { notValidated }
    val icon = when {
        busy -> Icons.Filled.Security
        allowed -> Icons.Filled.CheckCircle
        hasSerial -> Icons.Filled.Error
        else -> Icons.Filled.VpnKey
    }
    CardSurface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(16.dp)) {
            StatusLine(icon, if (allowed) stringResource(R.string.license_allowed) else stringResource(R.string.license_denied))
            VSpacer(6)
            Text(
                text = stringResource(R.string.license_reason_format, reasonText),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (effectiveExpires.isNotBlank()) {
                Text(
                    text = stringResource(R.string.license_expires_format, effectiveExpires),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (effectiveGrace.isNotBlank()) {
                Text(
                    text = stringResource(R.string.license_grace_format, effectiveGrace),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (effectiveServerTime.isNotBlank()) {
                Text(
                    text = stringResource(R.string.license_server_time_format, effectiveServerTime),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                text = stringResource(R.string.license_device_format, devicePreview),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = if (redactedSerial.isBlank()) stringResource(R.string.license_serial_missing)
                else stringResource(R.string.license_serial_active, redactedSerial),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            VSpacer(12)
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = onValidate, enabled = !busy && hasSerial) {
                    Text(stringResource(R.string.license_validate_now))
                }
                if (busy) {
                    Spacer(Modifier.width(12.dp))
                    CircularProgressIndicator(Modifier.width(22.dp))
                }
            }
        }
    }
}

@Composable
private fun StatusLine(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.material3.Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(Modifier.width(8.dp))
        Text(text = text, style = MaterialTheme.typography.titleMedium)
    }
}
