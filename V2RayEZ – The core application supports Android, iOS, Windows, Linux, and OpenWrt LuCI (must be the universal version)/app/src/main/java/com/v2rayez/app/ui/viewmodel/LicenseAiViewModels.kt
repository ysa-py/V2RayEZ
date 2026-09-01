package com.v2rayez.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.v2rayez.app.data.ai.AiGatewayResult
import com.v2rayez.app.data.ai.AndroidAiProviderGateway
import com.v2rayez.app.data.license.AndroidLicenseRepository
import com.v2rayez.app.data.license.LicenseValidationResult
import com.v2rayez.app.domain.model.AiEngineConfig
import com.v2rayez.app.domain.model.AiProviderConfig
import com.v2rayez.app.domain.model.LicenseConfig
import com.v2rayez.app.domain.repository.SettingsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class LicenseViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
    private val licenseRepository: AndroidLicenseRepository
) : ViewModel() {

    val config: StateFlow<LicenseConfig> = settingsRepository.settings()
        .map { it.license }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LicenseConfig())

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy

    private val _result = MutableStateFlow<LicenseValidationResult?>(null)
    val result: StateFlow<LicenseValidationResult?> = _result

    val hasSerial: Boolean get() = licenseRepository.hasActivatedLicense()
    val redactedSerial: String get() = licenseRepository.redactedSerial()
    val deviceIdPreview: String get() = licenseRepository.deviceIdForDisplay()

    fun updateConfig(update: (LicenseConfig) -> LicenseConfig) {
        viewModelScope.launch {
            settingsRepository.update { it.copy(license = update(it.license)) }
        }
    }

    fun activate(serial: String, accountId: String, endpoint: String, deviceLabel: String) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            val baseConfig = config.value.copy(
                accountId = accountId.trim(),
                validationUrl = endpoint.trim(),
                deviceLabel = deviceLabel.trim()
            )
            settingsRepository.update { it.copy(license = baseConfig) }
            val validation = licenseRepository.activate(serial, baseConfig)
            _result.value = validation
            persistResult(validation)
            _busy.value = false
        }
    }

    fun validateNow() {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            val validation = licenseRepository.validate(config.value)
            _result.value = validation
            persistResult(validation)
            _busy.value = false
        }
    }

    fun clearSerial() {
        licenseRepository.clear()
        viewModelScope.launch {
            settingsRepository.update {
                it.copy(
                    license = it.license.copy(
                        lastResult = "not_validated",
                        lastReason = "serial_cleared",
                        lastValidatedAt = System.currentTimeMillis(),
                        expiresAt = "",
                        offlineGraceUntil = ""
                    )
                )
            }
        }
        _result.value = null
    }

    private suspend fun persistResult(result: LicenseValidationResult) {
        settingsRepository.update {
            it.copy(
                license = it.license.copy(
                    lastResult = result.result,
                    lastReason = result.reason,
                    lastValidatedAt = result.checkedAt,
                    expiresAt = result.expiresAt,
                    offlineGraceUntil = result.offlineGraceUntil
                )
            )
        }
    }
}

@HiltViewModel
class AiEngineViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
    private val gateway: AndroidAiProviderGateway
) : ViewModel() {

    val config: StateFlow<AiEngineConfig> = settingsRepository.settings()
        .map { it.aiEngine }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AiEngineConfig())

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy

    private val _testResult = MutableStateFlow<AiGatewayResult?>(null)
    val testResult: StateFlow<AiGatewayResult?> = _testResult

    fun updateConfig(update: (AiEngineConfig) -> AiEngineConfig) {
        viewModelScope.launch {
            settingsRepository.update { it.copy(aiEngine = update(it.aiEngine)) }
        }
    }

    fun upsertProvider(provider: AiProviderConfig, apiSecret: String = "") {
        viewModelScope.launch {
            if (provider.apiKeyAlias.isNotBlank() && apiSecret.isNotBlank()) {
                gateway.saveSecret(provider.apiKeyAlias, apiSecret)
            }
            settingsRepository.update { settings ->
                val current = settings.aiEngine
                val providerId = provider.id.ifBlank { UUID.randomUUID().toString() }
                val normalized = if (providerId == "local-aether") {
                    provider.copy(
                        id = providerId,
                        type = com.v2rayez.app.domain.model.AiProviderType.LOCAL,
                        enabled = true,
                        baseUrl = "local://aether",
                        endpoint = "",
                        apiKeyAlias = ""
                    )
                } else {
                    provider.copy(id = providerId)
                }
                val updatedProviders = if (current.providers.any { it.id == providerId }) {
                    current.providers.map { if (it.id == providerId) normalized else it }
                } else {
                    current.providers + normalized
                }
                settings.copy(aiEngine = current.copy(providers = updatedProviders, selectedProviderId = providerId))
            }
        }
    }

    fun removeProvider(providerId: String) {
        if (providerId == "local-aether") return
        viewModelScope.launch {
            settingsRepository.update { settings ->
                val current = settings.aiEngine
                val remaining = current.providers.filterNot { it.id == providerId }
                settings.copy(
                    aiEngine = current.copy(
                        providers = remaining,
                        selectedProviderId = current.selectedProviderId.takeIf { id -> remaining.any { it.id == id } }
                            ?: remaining.firstOrNull()?.id.orEmpty()
                    )
                )
            }
        }
    }

    fun testProvider(provider: AiProviderConfig) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            val result = gateway.testProvider(provider)
            _testResult.value = result
            settingsRepository.update {
                it.copy(
                    aiEngine = it.aiEngine.copy(
                        lastProviderTestAt = System.currentTimeMillis(),
                        lastProviderTestResult = if (result.success) "ok:${result.source}" else "failed:${result.error}"
                    )
                )
            }
            _busy.value = false
        }
    }
}
