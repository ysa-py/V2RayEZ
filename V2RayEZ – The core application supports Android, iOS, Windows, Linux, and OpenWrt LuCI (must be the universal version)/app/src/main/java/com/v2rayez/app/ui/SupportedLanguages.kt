package com.v2rayez.app.ui

import com.v2rayez.app.domain.model.AiEngineConfig
import com.v2rayez.app.domain.model.AiProviderConfig
import com.v2rayez.app.domain.model.AiProviderType
import com.v2rayez.app.domain.model.AppSettings

/**
 * Single source of truth for UI languages shipped with the app.
 * English (US), Persian, and Russian — Arabic and Chinese are not supported.
 */
object SupportedLanguages {

    const val ENGLISH = "English (US)"
    const val PERSIAN = "Persian"
    const val RUSSIAN = "Russian"

    val labels: List<String> = listOf(ENGLISH, PERSIAN, RUSSIAN)

    private val labelToTag = mapOf(
        ENGLISH to "en",
        PERSIAN to "fa",
        RUSSIAN to "ru",
    )

    /** Legacy labels from removed locales or old backups — all map to English. */
    private val legacyLabels = setOf(
        "Arabic",
        "Chinese",
        "Simplified Chinese",
        "Traditional Chinese",
        "简体中文",
        "繁體中文",
        "العربية",
    )

    fun tagForLabel(label: String): String = labelToTag[label] ?: "en"

    /** Returns a supported label, rewriting legacy/unknown values to [ENGLISH]. */
    fun normalizeLabel(label: String): String = when {
        label in labelToTag -> label
        label in legacyLabels -> ENGLISH
        else -> ENGLISH
    }

    fun isSupported(label: String): Boolean = label in labelToTag

    /**
     * Normalize persisted settings loaded from DataStore.
     *
     * Besides locale safety, this migrates old donor-facing AI defaults to the
     * canonical V2RayEZ provider identity so restored backups cannot surface
     * legacy donor labels as product UI/UX while legacy values still resolve.
     */
    fun normalizeSettings(settings: AppSettings): AppSettings {
        val normalizedLanguage = normalizeLabel(settings.language)
        val normalizedAiEngine = normalizeAiEngine(settings.aiEngine)
        return if (normalizedLanguage == settings.language && normalizedAiEngine == settings.aiEngine) {
            settings
        } else {
            settings.copy(language = normalizedLanguage, aiEngine = normalizedAiEngine)
        }
    }

    private fun normalizeAiEngine(aiEngine: AiEngineConfig): AiEngineConfig {
        val defaultProvider = AiEngineConfig().providers.first()
        val normalizedProviders = (aiEngine.providers.ifEmpty { listOf(defaultProvider) })
            .map(::normalizeAiProvider)
            .distinctBy { canonicalProviderId(it.id) }
        val selected = canonicalProviderId(aiEngine.selectedProviderId).takeIf { id ->
            normalizedProviders.any { canonicalProviderId(it.id) == id }
        } ?: normalizedProviders.firstOrNull()?.id ?: defaultProvider.id
        val localModel = when (aiEngine.localModel) {
            "aether-anti-dpi-local", "micafp-anti-dpi-local" -> "v2rayez-anti-dpi-local"
            "" -> "v2rayez-anti-dpi-local"
            else -> aiEngine.localModel
        }
        return aiEngine.copy(
            selectedProviderId = selected,
            localModel = localModel,
            providers = normalizedProviders
        )
    }

    private fun normalizeAiProvider(provider: AiProviderConfig): AiProviderConfig {
        val canonicalId = canonicalProviderId(provider.id)
        val canonicalBaseUrl = when (provider.baseUrl) {
            "local://aether", "local://micafp" -> "local://v2rayez"
            else -> provider.baseUrl
        }
        val canonicalModel = when (provider.model) {
            "aether-anti-dpi-local", "micafp-anti-dpi-local" -> "v2rayez-anti-dpi-local"
            "" -> if (canonicalId == "local-v2rayez") "v2rayez-anti-dpi-local" else provider.model
            else -> provider.model
        }
        return if (canonicalId == "local-v2rayez") {
            provider.copy(
                id = "local-v2rayez",
                name = "V2RayEZ Local AI",
                type = AiProviderType.LOCAL,
                enabled = true,
                baseUrl = "local://v2rayez",
                endpoint = "",
                model = canonicalModel,
                apiKeyAlias = "",
                responsePath = provider.responsePath.ifBlank { "text" }
            )
        } else {
            provider.copy(id = canonicalId, baseUrl = canonicalBaseUrl, model = canonicalModel)
        }
    }

    private fun canonicalProviderId(providerId: String): String = when (providerId) {
        "local-aether", "local_micafp", "local-micafp" -> "local-v2rayez"
        else -> providerId.ifBlank { "local-v2rayez" }
    }
}
