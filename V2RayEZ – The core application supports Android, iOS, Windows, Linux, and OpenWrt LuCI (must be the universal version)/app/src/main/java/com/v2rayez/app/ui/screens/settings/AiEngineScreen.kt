package com.v2rayez.app.ui.screens.settings

import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.v2rayez.app.R
import com.v2rayez.app.domain.model.AiProviderConfig
import com.v2rayez.app.domain.model.AiProviderType
import com.v2rayez.app.ui.components.CardSurface
import com.v2rayez.app.ui.components.SectionHeader
import com.v2rayez.app.ui.components.SettingSwitchRow
import com.v2rayez.app.ui.components.V2BackTopBar
import com.v2rayez.app.ui.components.VSpacer
import com.v2rayez.app.ui.viewmodel.AiEngineViewModel
import java.util.UUID

@Composable
fun AiEngineScreen(
    onBack: () -> Unit,
    viewModel: AiEngineViewModel = hiltViewModel()
) {
    val config by viewModel.config.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val testResult by viewModel.testResult.collectAsState()

    var editId by remember { mutableStateOf<String?>(null) }
    var name by remember { mutableStateOf("") }
    var type by remember { mutableStateOf(AiProviderType.OPENAI) }
    var baseUrl by remember { mutableStateOf("") }
    var endpoint by remember { mutableStateOf("") }
    var model by remember { mutableStateOf("") }
    var apiAlias by remember { mutableStateOf("") }
    var apiSecret by remember { mutableStateOf("") }
    var headersJson by remember { mutableStateOf("{}") }
    var requestTemplate by remember { mutableStateOf("") }
    var responsePath by remember { mutableStateOf("") }

    fun load(provider: AiProviderConfig) {
        editId = provider.id
        name = provider.name
        type = provider.type
        baseUrl = provider.baseUrl
        endpoint = provider.endpoint
        model = provider.model
        apiAlias = provider.apiKeyAlias
        apiSecret = ""
        headersJson = provider.headersJson
        requestTemplate = provider.requestTemplate
        responsePath = provider.responsePath
    }

    fun resetEditor() {
        editId = null
        name = ""
        type = AiProviderType.OPENAI
        baseUrl = ""
        endpoint = ""
        model = ""
        apiAlias = ""
        apiSecret = ""
        headersJson = "{}"
        requestTemplate = ""
        responsePath = ""
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        V2BackTopBar(title = stringResource(R.string.ai_engine_title), onBack = onBack)
        Column(Modifier.padding(horizontal = 16.dp)) {
            SectionHeader(title = stringResource(R.string.ai_engine_section_runtime))
            CardSurface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                Column {
                    SettingSwitchRow(
                        Icons.Filled.AutoAwesome,
                        stringResource(R.string.ai_engine_enable),
                        config.enabled,
                        { enabled -> viewModel.updateConfig { it.copy(enabled = enabled) } },
                        subtitle = stringResource(R.string.ai_engine_enable_sub)
                    )
                    SettingSwitchRow(
                        Icons.Filled.CloudDone,
                        stringResource(R.string.ai_engine_local_fallback),
                        config.autoFallbackToLocal,
                        { enabled -> viewModel.updateConfig { it.copy(autoFallbackToLocal = enabled) } },
                        subtitle = stringResource(R.string.ai_engine_local_fallback_sub)
                    )
                }
            }
            VSpacer(18)

            SectionHeader(title = stringResource(R.string.ai_engine_section_providers))
            config.providers.forEach { provider ->
                ProviderCard(
                    provider = provider,
                    selected = provider.id == config.selectedProviderId,
                    busy = busy,
                    onSelect = { viewModel.updateConfig { it.copy(selectedProviderId = provider.id) } },
                    onEdit = { load(provider) },
                    onDelete = { viewModel.removeProvider(provider.id) },
                    onTest = { viewModel.testProvider(provider) }
                )
                VSpacer(8)
            }
            testResult?.let { result ->
                CardSurface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            text = if (result.success) stringResource(R.string.ai_engine_test_ok, result.providerName, result.source)
                            else stringResource(R.string.ai_engine_test_failed, result.providerName, result.error),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (result.text.isNotBlank()) {
                            VSpacer(6)
                            Text(result.text.take(500), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                VSpacer(12)
            }

            SectionHeader(title = stringResource(R.string.ai_engine_section_editor))
            CardSurface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text(stringResource(R.string.ai_engine_provider_name)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    Row(Modifier.horizontalScroll(rememberScrollState())) {
                        AiProviderType.entries.forEach { providerType ->
                            FilterChip(
                                selected = type == providerType,
                                onClick = { type = providerType },
                                label = { Text(providerType.label) }
                            )
                            Spacer(Modifier.width(8.dp))
                        }
                    }
                    VSpacer(8)
                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = { baseUrl = it.trim() },
                        label = { Text(stringResource(R.string.ai_engine_base_url)) },
                        placeholder = { Text("https://api.openai.com") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = endpoint,
                        onValueChange = { endpoint = it.trim() },
                        label = { Text(stringResource(R.string.ai_engine_endpoint)) },
                        placeholder = { Text("/v1/chat/completions") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = model,
                        onValueChange = { model = it.trim() },
                        label = { Text(stringResource(R.string.ai_engine_model)) },
                        placeholder = { Text("gpt-4.1-mini") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = apiAlias,
                        onValueChange = { apiAlias = it.trim() },
                        label = { Text(stringResource(R.string.ai_engine_api_alias)) },
                        placeholder = { Text("openai-main") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = apiSecret,
                        onValueChange = { apiSecret = it },
                        label = { Text(stringResource(R.string.ai_engine_api_secret)) },
                        placeholder = { Text(stringResource(R.string.ai_engine_api_secret_hint)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = headersJson,
                        onValueChange = { headersJson = it },
                        label = { Text(stringResource(R.string.ai_engine_headers_json)) },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = requestTemplate,
                        onValueChange = { requestTemplate = it },
                        label = { Text(stringResource(R.string.ai_engine_request_template)) },
                        placeholder = { Text("{\"model\":\"${'$'}{model}\",\"messages\":[...]}") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(8)
                    OutlinedTextField(
                        value = responsePath,
                        onValueChange = { responsePath = it.trim() },
                        label = { Text(stringResource(R.string.ai_engine_response_path)) },
                        placeholder = { Text("choices.0.message.content") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    VSpacer(12)
                    val defaultProviderName = stringResource(R.string.ai_engine_provider_default_name)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Button(
                            onClick = {
                                val provider = AiProviderConfig(
                                    id = editId ?: UUID.randomUUID().toString(),
                                    name = name.ifBlank { defaultProviderName },
                                    type = type,
                                    enabled = true,
                                    baseUrl = baseUrl,
                                    endpoint = endpoint,
                                    model = model,
                                    apiKeyAlias = apiAlias,
                                    headersJson = headersJson.ifBlank { "{}" },
                                    requestTemplate = requestTemplate,
                                    responsePath = responsePath
                                )
                                viewModel.upsertProvider(provider, apiSecret)
                                resetEditor()
                            }
                        ) { Text(stringResource(R.string.action_save)) }
                        Spacer(Modifier.width(10.dp))
                        OutlinedButton(onClick = ::resetEditor) { Text(stringResource(R.string.action_cancel)) }
                    }
                }
            }
            VSpacer(24)
        }
    }
}

@Composable
private fun ProviderCard(
    provider: AiProviderConfig,
    selected: Boolean,
    busy: Boolean,
    onSelect: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onTest: () -> Unit
) {
    CardSurface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text(provider.name, style = MaterialTheme.typography.titleMedium)
            Text(
                text = stringResource(
                    R.string.ai_engine_provider_summary,
                    provider.type.label,
                    provider.model.ifBlank { "—" },
                    provider.baseUrl.ifBlank { "local" }
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            VSpacer(10)
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedButton(onClick = onSelect, enabled = !selected) {
                    Text(if (selected) stringResource(R.string.ai_engine_selected) else stringResource(R.string.ai_engine_select))
                }
                Spacer(Modifier.width(8.dp))
                OutlinedButton(onClick = onTest, enabled = !busy) {
                    androidx.compose.material3.Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.ai_engine_test))
                }
                Spacer(Modifier.width(8.dp))
                TextButton(onClick = onEdit) {
                    androidx.compose.material3.Icon(Icons.Filled.Edit, contentDescription = null)
                    Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.action_edit))
                }
                if (provider.id != "local-aether") {
                    TextButton(onClick = onDelete) {
                        androidx.compose.material3.Icon(Icons.Filled.Delete, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text(stringResource(R.string.action_delete))
                    }
                }
            }
        }
    }
}
