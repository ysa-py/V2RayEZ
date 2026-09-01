package com.v2rayez.app.data.ai

import com.v2rayez.app.data.security.SecureStringStore
import com.v2rayez.app.domain.model.AiEngineConfig
import com.v2rayez.app.domain.model.AiProviderConfig
import com.v2rayez.app.domain.model.AiProviderType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** Result of an AI provider test/completion request. */
data class AiGatewayResult(
    val success: Boolean,
    val providerId: String,
    val providerName: String,
    val source: String,
    val text: String = "",
    val error: String = "",
    val blockedOrUnreachable: Boolean = false
)

/**
 * No-code Android AI Provider Gateway. It executes user-defined HTTP provider configs, resolves
 * API keys by alias from [SecureStringStore], redacts secrets from errors, and falls back to the
 * local Aether/V2RayEZ anti-DPI policy when network/provider calls are blocked.
 */
@Singleton
class AndroidAiProviderGateway @Inject constructor(
    private val httpClient: OkHttpClient,
    private val secureStore: SecureStringStore
) {
    suspend fun testProvider(provider: AiProviderConfig, prompt: String = TEST_PROMPT): AiGatewayResult =
        withContext(Dispatchers.IO) {
            if (provider.local) return@withContext localFallback(prompt, provider)
            runCatching { callProvider(provider, prompt) }.getOrElse { error ->
                AiGatewayResult(
                    success = false,
                    providerId = provider.id,
                    providerName = provider.name,
                    source = "external",
                    error = redact(error.message ?: error.javaClass.simpleName, provider),
                    blockedOrUnreachable = true
                )
            }
        }

    suspend fun completeAntiDpiPlan(config: AiEngineConfig, prompt: String): AiGatewayResult =
        withContext(Dispatchers.IO) {
            if (!config.enabled) return@withContext localFallback(prompt)
            val providers = config.providers.filter { it.enabled }
            val selected = providers.firstOrNull { it.id == config.selectedProviderId }
            val ordered = listOfNotNull(selected) + providers.filter { it.id != selected?.id && !it.local }
            for (provider in ordered) {
                if (provider.local) continue
                val result = testProvider(provider, prompt)
                if (result.success) return@withContext result
                if (!result.blockedOrUnreachable && !config.autoFallbackToLocal) return@withContext result
            }
            if (config.autoFallbackToLocal) localFallback(prompt) else AiGatewayResult(
                success = false,
                providerId = selected?.id.orEmpty(),
                providerName = selected?.name.orEmpty(),
                source = "external",
                error = "No external AI provider succeeded"
            )
        }

    fun saveSecret(alias: String, value: String) {
        if (alias.isBlank()) return
        if (value.isBlank()) secureStore.remove(secretKey(alias)) else secureStore.put(secretKey(alias), value)
    }

    fun hasSecret(alias: String): Boolean = alias.isNotBlank() && secureStore.contains(secretKey(alias))

    private fun callProvider(provider: AiProviderConfig, prompt: String): AiGatewayResult {
        val url = buildUrl(provider)
        val requestBody = renderRequestBody(provider, prompt)
        val builder = Request.Builder().url(url).header("Accept", "application/json")
        for ((name, value) in renderHeaders(provider)) {
            if (name.isNotBlank() && value.isNotBlank()) builder.header(name, value)
        }
        val request = when (provider.method.uppercase(Locale.US)) {
            "GET" -> builder.get().build()
            else -> builder.post(requestBody.toRequestBody(JSON_MEDIA)).build()
        }
        val client = httpClient.newBuilder()
            .connectTimeout(provider.timeoutMs.coerceIn(2_000, 120_000).toLong(), TimeUnit.MILLISECONDS)
            .readTimeout(provider.timeoutMs.coerceIn(2_000, 120_000).toLong(), TimeUnit.MILLISECONDS)
            .writeTimeout(provider.timeoutMs.coerceIn(2_000, 120_000).toLong(), TimeUnit.MILLISECONDS)
            .build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("HTTP ${response.code}: ${body.take(300)}")
            }
            val text = extractResponseText(body, provider.responsePath)
            return AiGatewayResult(
                success = text.isNotBlank(),
                providerId = provider.id,
                providerName = provider.name,
                source = "external",
                text = text,
                error = if (text.isBlank()) "Provider returned no usable text" else ""
            )
        }
    }

    private fun buildUrl(provider: AiProviderConfig): String {
        val base = provider.baseUrl.trim().trimEnd('/')
        val path = provider.endpoint.trim()
        require(base.startsWith("http://") || base.startsWith("https://")) { "Provider baseUrl must be http(s)" }
        return if (path.isBlank()) base else "$base/${path.trimStart('/')}"
    }

    private fun renderHeaders(provider: AiProviderConfig): Map<String, String> {
        val apiKey = secureStore.get(secretKey(provider.apiKeyAlias)).orEmpty()
        val headers = linkedMapOf<String, String>()
        if (provider.type == AiProviderType.OPENAI || provider.type == AiProviderType.GEMINI || provider.type == AiProviderType.GENERIC) {
            if (apiKey.isNotBlank()) headers["Authorization"] = "Bearer $apiKey"
        }
        if (provider.type == AiProviderType.ANTHROPIC) {
            if (apiKey.isNotBlank()) headers["x-api-key"] = apiKey
            headers["anthropic-version"] = "2023-06-01"
        }
        val raw = provider.headersJson.ifBlank { "{}" }
        runCatching {
            val json = JSONObject(raw)
            val names = json.keys()
            while (names.hasNext()) {
                val name = names.next()
                headers[name] = renderTemplate(json.optString(name), provider, "", apiKey)
            }
        }
        return headers
    }

    private fun renderRequestBody(provider: AiProviderConfig, prompt: String): String {
        val apiKey = secureStore.get(secretKey(provider.apiKeyAlias)).orEmpty()
        val template = provider.requestTemplate.ifBlank { defaultTemplate(provider) }
        return renderTemplate(template, provider, prompt, apiKey)
    }

    private fun renderTemplate(template: String, provider: AiProviderConfig, prompt: String, apiKey: String): String =
        template
            .replace("${'$'}{prompt}", JSONObject.quote(prompt).removeSurrounding("\""))
            .replace("${'$'}{prompt_json}", JSONObject.quote(prompt))
            .replace("${'$'}{model}", provider.model)
            .replace("${'$'}{api_key}", apiKey)
            .replace("${'$'}{system_prompt}", JSONObject.quote(provider.systemPrompt).removeSurrounding("\""))
            .replace("${'$'}{system_prompt_json}", JSONObject.quote(provider.systemPrompt))

    private fun defaultTemplate(provider: AiProviderConfig): String = when (provider.type) {
        AiProviderType.ANTHROPIC -> """
            {"model":"${'$'}{model}","max_tokens":512,"messages":[{"role":"user","content":${'$'}{prompt_json}}]}
        """.trimIndent()
        AiProviderType.GEMINI -> """
            {"contents":[{"parts":[{"text":${'$'}{prompt_json}}]}]}
        """.trimIndent()
        else -> """
            {"model":"${'$'}{model}","messages":[{"role":"system","content":"Return concise anti-DPI tuning guidance."},{"role":"user","content":${'$'}{prompt_json}}]}
        """.trimIndent()
    }

    private fun extractResponseText(body: String, configuredPath: String): String {
        val json = runCatching { JSONObject(body) }.getOrNull()
        if (json != null) {
            if (configuredPath.isNotBlank()) valueAtPath(json, configuredPath)?.let { return it }
            valueAtPath(json, "choices.0.message.content")?.let { return it }
            valueAtPath(json, "choices.0.text")?.let { return it }
            valueAtPath(json, "content.0.text")?.let { return it }
            valueAtPath(json, "candidates.0.content.parts.0.text")?.let { return it }
            valueAtPath(json, "text")?.let { return it }
            valueAtPath(json, "response")?.let { return it }
        }
        return body.take(4_000)
    }

    private fun valueAtPath(root: Any, path: String): String? {
        var current: Any? = root
        for (part in path.split('.')) {
            current = when (current) {
                is JSONObject -> current.opt(part)
                is JSONArray -> part.toIntOrNull()?.let { index -> if (index in 0 until current.length()) current.opt(index) else null }
                else -> null
            }
        }
        return when (current) {
            is String -> current
            null, JSONObject.NULL -> null
            else -> current.toString()
        }?.takeIf { it.isNotBlank() }
    }

    private fun localFallback(prompt: String, provider: AiProviderConfig? = null): AiGatewayResult {
        val mode = when {
            prompt.contains("sni", ignoreCase = true) -> "Prefer randomized SNI padding, TLS fragmentation, and conservative fake-SNI rotation."
            prompt.contains("dns", ignoreCase = true) -> "Prefer DoH through proxy, FakeDNS only when mapping is stable, and bypass private/LAN ranges."
            prompt.contains("tor", ignoreCase = true) -> "Keep Tor and domain-fronting mutually exclusive, use bridge auto-rotation, and hard-fail on DNS leaks."
            else -> "Use adaptive routing: start with Xray, probe connectivity, then enable fragment/desync/fronting only when the baseline path fails."
        }
        return AiGatewayResult(
            success = true,
            providerId = provider?.id ?: "local-aether",
            providerName = provider?.name ?: "V2RayEZ Local AI",
            source = "local_fallback",
            text = mode
        )
    }

    private fun redact(message: String, provider: AiProviderConfig): String {
        var out = message
        secureStore.get(secretKey(provider.apiKeyAlias))?.takeIf { it.isNotBlank() }?.let { secret ->
            out = out.replace(secret, "[redacted]")
        }
        return out
    }

    private fun secretKey(alias: String): String = "ai.secret.${alias.ifBlank { UUID.nameUUIDFromBytes(ByteArray(0)).toString() }}"

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
        private const val TEST_PROMPT = "Suggest a safe V2RayEZ anti-DPI strategy for a blocked TLS connection."
    }
}
