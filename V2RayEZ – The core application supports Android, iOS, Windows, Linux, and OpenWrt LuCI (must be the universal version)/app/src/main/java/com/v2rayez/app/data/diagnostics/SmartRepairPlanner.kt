package com.v2rayez.app.data.diagnostics

import com.v2rayez.app.domain.model.AiEngineConfig
import com.v2rayez.app.domain.model.AiProviderConfig
import com.v2rayez.app.domain.model.AiProviderType
import com.v2rayez.app.domain.model.AppSettings

/** Stable action IDs used by diagnostics reports and tests. */
enum class SmartRepairActionId {
    ENABLE_TUN_DNS,
    NORMALIZE_LOCAL_PORTS,
    NORMALIZE_MTU,
    SYNC_LAN_SHARING,
    ENABLE_AI_LOCAL_FALLBACK,
    RESET_INVALID_DNS,
    PRIORITIZE_TOR_OVER_FRONTING,
    ALIGN_LOCKDOWN_REQUEST
}

data class SmartRepairAction(
    val id: SmartRepairActionId,
    val detail: String
)

data class SmartRepairPlan(
    val settings: AppSettings,
    val applied: List<SmartRepairAction> = emptyList(),
    val warnings: List<SmartRepairAction> = emptyList(),
    val reconnectRequired: Boolean = false
)

/**
 * Deterministic, non-network repair plan for the Android V2RayEZ UI.
 *
 * This intentionally changes only safe local settings that are known to break tunnels when they
 * are inconsistent (DNS/sniffing, impossible ports, invalid MTU, stale LAN flags, AI fallback,
 * and mutually-exclusive Tor/fronting). It never deletes servers, subscriptions, keys, or addon
 * packs, and every automatic change is returned as an auditable [SmartRepairAction].
 */
object SmartRepairPlanner {
    private const val DEFAULT_SOCKS_PORT = 10808
    private const val DEFAULT_HTTP_PORT = 10809
    private const val DEFAULT_REMOTE_DNS = "1.1.1.1"
    private const val DEFAULT_DOMESTIC_DNS = "223.5.5.5"
    private const val LOCAL_PROVIDER_ID = "local-v2rayez"
    private const val LEGACY_LOCAL_PROVIDER_ID = "local-aether"

    fun plan(input: AppSettings, connected: Boolean): SmartRepairPlan {
        var settings = input
        val applied = mutableListOf<SmartRepairAction>()
        val warnings = mutableListOf<SmartRepairAction>()
        var reconnectRequired = false

        if (!settings.enableLocalDns || !settings.enableSniffing) {
            settings = settings.copy(enableLocalDns = true, enableSniffing = true)
            applied += SmartRepairAction(
                SmartRepairActionId.ENABLE_TUN_DNS,
                "Enabled LocalDNS and sniffing so Android TUN DNS follows the proxy path."
            )
            reconnectRequired = reconnectRequired || connected
        }

        val normalizedSocks = normalizePort(settings.socksPort, DEFAULT_SOCKS_PORT)
        val normalizedHttp = normalizePort(settings.httpPort, DEFAULT_HTTP_PORT)
            .let { if (it == normalizedSocks) fallbackHttpPort(normalizedSocks) else it }
        if (normalizedSocks != settings.socksPort || normalizedHttp != settings.httpPort) {
            settings = settings.copy(socksPort = normalizedSocks, httpPort = normalizedHttp)
            applied += SmartRepairAction(
                SmartRepairActionId.NORMALIZE_LOCAL_PORTS,
                "Normalized local SOCKS/HTTP ports to $normalizedSocks/$normalizedHttp."
            )
            reconnectRequired = reconnectRequired || connected
        }

        val normalizedMtu = settings.mtu.coerceIn(576, 1500)
        if (normalizedMtu != settings.mtu) {
            settings = settings.copy(mtu = 1280)
            applied += SmartRepairAction(
                SmartRepairActionId.NORMALIZE_MTU,
                "Reset invalid MTU to the mobile-safe 1280 value."
            )
            reconnectRequired = reconnectRequired || connected
        }

        if (settings.allowLan != settings.enableLanSharing) {
            val enabled = settings.allowLan || settings.enableLanSharing
            settings = settings.copy(allowLan = enabled, enableLanSharing = enabled)
            applied += SmartRepairAction(
                SmartRepairActionId.SYNC_LAN_SHARING,
                "Synchronized LAN/hotspot sharing flags so proxy bind behavior matches the UI."
            )
            reconnectRequired = reconnectRequired || connected
        }

        val repairedDns = repairDns(settings)
        if (repairedDns != settings) {
            settings = repairedDns
            applied += SmartRepairAction(
                SmartRepairActionId.RESET_INVALID_DNS,
                "Replaced blank or malformed DNS values with safe defaults."
            )
            reconnectRequired = reconnectRequired || connected
        }

        val repairedAi = repairAi(settings.aiEngine)
        if (repairedAi != settings.aiEngine) {
            settings = settings.copy(aiEngine = repairedAi)
            applied += SmartRepairAction(
                SmartRepairActionId.ENABLE_AI_LOCAL_FALLBACK,
                "Ensured V2RayEZ local AI fallback remains available when external APIs are blocked."
            )
        }

        if (settings.tor.enabled && settings.domainFront.enabled) {
            settings = settings.copy(domainFront = settings.domainFront.copy(enabled = false))
            applied += SmartRepairAction(
                SmartRepairActionId.PRIORITIZE_TOR_OVER_FRONTING,
                "Disabled domain fronting for this profile because Tor and fronting are mutually exclusive at connect time."
            )
            reconnectRequired = reconnectRequired || connected
        }

        if (settings.blockWithoutVpn && !settings.vpnAlwaysOn) {
            settings = settings.copy(vpnAlwaysOn = true)
            applied += SmartRepairAction(
                SmartRepairActionId.ALIGN_LOCKDOWN_REQUEST,
                "Enabled the app's Always-on request; Android system VPN settings must still grant lockdown."
            )
        }

        return SmartRepairPlan(
            settings = settings,
            applied = applied,
            warnings = warnings,
            reconnectRequired = reconnectRequired
        )
    }

    private fun normalizePort(value: Int, fallback: Int): Int =
        if (value in 1024..65535) value else fallback

    private fun fallbackHttpPort(socksPort: Int): Int =
        if (socksPort == DEFAULT_HTTP_PORT) DEFAULT_SOCKS_PORT else DEFAULT_HTTP_PORT

    private fun repairDns(settings: AppSettings): AppSettings {
        val remote = settings.dns.remoteDns.trim().takeIf(::looksLikeDnsEndpoint) ?: DEFAULT_REMOTE_DNS
        val domestic = settings.dns.domesticDns.trim().takeIf(::looksLikeDnsEndpoint) ?: DEFAULT_DOMESTIC_DNS
        return if (remote == settings.dns.remoteDns && domestic == settings.dns.domesticDns) {
            settings
        } else {
            settings.copy(dns = settings.dns.copy(remoteDns = remote, domesticDns = domestic))
        }
    }

    private fun looksLikeDnsEndpoint(value: String): Boolean {
        if (value.isBlank() || value.any { it.isWhitespace() }) return false
        val host = value.substringAfter("://", value).substringBefore('/').substringBeforeLast(':')
        return host.isNotBlank() && host.length <= 253 && host.none { it == '/' || it == '\\' }
    }

    private fun repairAi(config: AiEngineConfig): AiEngineConfig {
        val localProvider = AiProviderConfig(
            id = LOCAL_PROVIDER_ID,
            name = "V2RayEZ Local AI",
            type = AiProviderType.LOCAL,
            enabled = true,
            baseUrl = "local://v2rayez",
            endpoint = "",
            model = "v2rayez-anti-dpi-local",
            apiKeyAlias = "",
            responsePath = "text"
        )
        val normalizedProviders = config.providers
            .map { provider ->
                if (provider.id == LEGACY_LOCAL_PROVIDER_ID || provider.id == LOCAL_PROVIDER_ID) localProvider else provider
            }
            .let { providers ->
                if (providers.any { it.id == LOCAL_PROVIDER_ID }) providers else providers + localProvider
            }
            .distinctBy { it.id }
        val selectedExists = normalizedProviders.any { it.id == config.selectedProviderId && it.enabled }
        return config.copy(
            enabled = true,
            autoFallbackToLocal = true,
            localModel = config.localModel.ifBlank { "v2rayez-anti-dpi-local" },
            selectedProviderId = if (selectedExists) config.selectedProviderId else LOCAL_PROVIDER_ID,
            providers = normalizedProviders
        )
    }
}
