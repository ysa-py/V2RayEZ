package com.v2rayez.app.data.core

import android.content.Context
import android.telephony.TelephonyManager
import com.v2rayez.app.domain.model.AppSettings
import com.v2rayez.app.domain.model.CorePreference
import com.v2rayez.app.domain.model.Protocol
import com.v2rayez.app.domain.model.ProxyCoreType
import com.v2rayez.app.domain.model.Server
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/** Iranian carrier profiles from the V2RayEZ Universal donor inventory. */
enum class IranianCarrierProfile(
    val label: String,
    val aliases: List<String>,
    val mccMncPrefixes: List<String>
) {
    MCI(
        label = "MCI / Hamrah-Aval",
        aliases = listOf("mci", "hamrah", "hamrah aval", "همراه", "همراه اول", "ir-mci"),
        mccMncPrefixes = listOf("43211", "43219", "43270")
    ),
    IRANCELL(
        label = "IranCell / MTN",
        aliases = listOf("irancell", "mtn", "ایرانسل", "irancell-ir"),
        mccMncPrefixes = listOf("43235")
    ),
    SHATEL(
        label = "Shatel / Shatel Mobile",
        aliases = listOf("shatel", "شاتل", "shatel mobile", "shatelmobile"),
        mccMncPrefixes = listOf("43250")
    ),
    ASIATEK(
        label = "Asiatek",
        aliases = listOf("asiatek", "آسیاتک", "asia tech", "asia-tech"),
        mccMncPrefixes = emptyList()
    ),
    RIGHTEL(
        label = "Rightel",
        aliases = listOf("rightel", "رایتل", "ritel"),
        mccMncPrefixes = listOf("43220")
    );

    companion object {
        fun from(rawOperator: String, rawNumeric: String): IranianCarrierProfile? {
            val operator = rawOperator.lowercase()
                .replace('-', ' ')
                .replace('_', ' ')
                .trim()
            entries.firstOrNull { profile ->
                rawNumeric.isNotBlank() && profile.mccMncPrefixes.any { rawNumeric.startsWith(it) }
            }?.let { return it }
            return entries.firstOrNull { profile ->
                profile.aliases.any { alias -> operator.contains(alias.lowercase()) }
            }
        }
    }
}

/** The exact named MICAFP VPN core identities and their coarse Android runtime homes. */
data class NamedVpnCoreProfile(
    val id: String,
    val displayName: String,
    val version: String,
    val protocols: List<String>,
    val role: String,
    val androidRuntimePreference: List<ProxyCoreType>,
    val addonProtocol: Protocol? = null
) {
    val inventoryLine: String = "$displayName $version — ${protocols.joinToString()} — $role"
}

object V2RayEzNamedCoreInventory {
    val cores: List<NamedVpnCoreProfile> = listOf(
        NamedVpnCoreProfile(
            id = "hiddify-core",
            displayName = "hiddify-core",
            version = "v4.1.0",
            protocols = listOf("VLESS Reality", "VMess", "Trojan", "Hysteria2", "TUICv5", "ShadowTLSv3", "NaiveProxy"),
            role = "primary orchestration core",
            androidRuntimePreference = listOf(ProxyCoreType.SING_BOX, ProxyCoreType.XRAY)
        ),
        NamedVpnCoreProfile(
            id = "gfw-knocker-xray",
            displayName = "GFW-knocker/Xray-core",
            version = "v25.8.3-mahsa-r1",
            protocols = listOf("VLESS Fragment", "MVLESS", "WireGuard Noise", "FakeHost"),
            role = "Iran-specialized",
            androidRuntimePreference = listOf(ProxyCoreType.XRAY)
        ),
        NamedVpnCoreProfile(
            id = "sing-box",
            displayName = "sing-box",
            version = "v1.14.0-alpha.25",
            protocols = listOf("Hysteria2", "TUICv5", "ShadowTLSv3", "NaiveProxy"),
            role = "protocol management",
            androidRuntimePreference = listOf(ProxyCoreType.SING_BOX)
        ),
        NamedVpnCoreProfile(
            id = "amnezia-awg",
            displayName = "AmneziaVPN (awg-go)",
            version = "4.8.15.4",
            protocols = listOf("AmneziaWG 1.5 with junk headers"),
            role = "AmneziaWG transport core",
            androidRuntimePreference = listOf(ProxyCoreType.SING_BOX, ProxyCoreType.XRAY)
        ),
        NamedVpnCoreProfile(
            id = "defyxvpn",
            displayName = "DefyxVPN",
            version = "v5.2.8",
            protocols = listOf("VLESS Reality", "AmneziaWG 1.5"),
            role = "high-speed P2P-assisted",
            androidRuntimePreference = listOf(ProxyCoreType.SING_BOX, ProxyCoreType.XRAY)
        ),
        NamedVpnCoreProfile(
            id = "moav",
            displayName = "MoaV",
            version = "v1.7.7",
            protocols = listOf("MoaV Tunnel"),
            role = "adaptive, dynamic key rotation",
            androidRuntimePreference = listOf(ProxyCoreType.SING_BOX)
        ),
        NamedVpnCoreProfile(
            id = "lantern",
            displayName = "Lantern",
            version = "v7.9.0",
            protocols = listOf("Domain Fronting", "Pluggable Transports"),
            role = "fronted fallback core",
            androidRuntimePreference = listOf(ProxyCoreType.SING_BOX, ProxyCoreType.XRAY)
        ),
        NamedVpnCoreProfile(
            id = "mahsang",
            displayName = "MahsaNG core",
            version = "v26.3.31-mahsa-r1",
            protocols = listOf("MVLESS", "WireGuard Noise", "VLESS Fragment"),
            role = "Iran-tuned",
            androidRuntimePreference = listOf(ProxyCoreType.XRAY)
        ),
        NamedVpnCoreProfile(
            id = "psiphon-gfw-knocker",
            displayName = "Psiphon (GFW-knocker fork)",
            version = "bundled/addon",
            protocols = listOf("SSH+Obfs", "CDN Fronting"),
            role = "last-resort serverless backup",
            androidRuntimePreference = listOf(ProxyCoreType.SING_BOX),
            addonProtocol = Protocol.PSIPHON
        )
    )

    private val byId = cores.associateBy { it.id }

    val carrierPreferences: Map<IranianCarrierProfile, List<NamedVpnCoreProfile>> = mapOf(
        IranianCarrierProfile.MCI to listOf("mahsang", "amnezia-awg").mapNotNull(byId::get),
        IranianCarrierProfile.IRANCELL to listOf("hiddify-core", "defyxvpn").mapNotNull(byId::get),
        IranianCarrierProfile.SHATEL to listOf("amnezia-awg", "psiphon-gfw-knocker").mapNotNull(byId::get),
        IranianCarrierProfile.ASIATEK to listOf("mahsang", "hiddify-core").mapNotNull(byId::get),
        IranianCarrierProfile.RIGHTEL to listOf("defyxvpn", "hiddify-core").mapNotNull(byId::get)
    )
}

data class CarrierCoreDecision(
    val detectedCarrier: IranianCarrierProfile?,
    val selectedCore: ProxyCoreType,
    val selectedNamedCore: NamedVpnCoreProfile?,
    val reason: String,
    val preferences: List<NamedVpnCoreProfile>
) {
    val changed: Boolean get() = selectedNamedCore != null
}

/**
 * UAC-Windows-style per-carrier profile selector for Android.
 *
 * The detector intentionally uses only coarse operator display/numeric values exposed by
 * TelephonyManager. It does not request READ_PHONE_STATE and does not collect phone numbers,
 * subscriber ids, IMEI/MEID, IMSI, ICCID, BSSID, SSID, or local IP addresses.
 */
@Singleton
class AndroidCarrierCoreSelector @Inject constructor(
    @ApplicationContext context: Context
) {
    private val appContext = context.applicationContext

    fun detectCarrier(): IranianCarrierProfile? {
        val telephony = appContext.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            ?: return null
        val names = listOfNotNull(
            runCatching { telephony.networkOperatorName }.getOrNull(),
            runCatching { telephony.simOperatorName }.getOrNull()
        ).filter { it.isNotBlank() }.joinToString(" ")
        val numeric = listOfNotNull(
            runCatching { telephony.networkOperator }.getOrNull(),
            runCatching { telephony.simOperator }.getOrNull()
        ).firstOrNull { it.isNotBlank() }.orEmpty()
        return IranianCarrierProfile.from(names, numeric)
    }

    fun currentPreferences(): List<NamedVpnCoreProfile> =
        detectCarrier()?.let { V2RayEzNamedCoreInventory.carrierPreferences[it] }.orEmpty()

    fun chooseCore(server: Server, settings: AppSettings, baseCore: ProxyCoreType): CarrierCoreDecision {
        val detected = detectCarrier()
        val preferences = detected?.let { V2RayEzNamedCoreInventory.carrierPreferences[it] }.orEmpty()
        if (!settings.carrierCoreAutoEnabled) {
            return CarrierCoreDecision(detected, baseCore, null, "carrier auto disabled", preferences)
        }
        if (server.preferredCore != CorePreference.SYSTEM) {
            return CarrierCoreDecision(detected, baseCore, null, "server pins ${server.preferredCore.label}", preferences)
        }
        if (detected == null || preferences.isEmpty()) {
            return CarrierCoreDecision(detected, baseCore, null, "carrier not detected", preferences)
        }
        if (settings.tor.enabled || settings.domainFront.enabled) {
            return CarrierCoreDecision(detected, baseCore, null, "Tor/domain-fronting requires Xray wiring", preferences)
        }
        if (server.protocol.usesStandaloneEngine()) {
            return CarrierCoreDecision(detected, baseCore, null, "standalone protocol engine", preferences)
        }
        val preferred = preferences.firstNotNullOfOrNull { named ->
            val runtime = named.androidRuntimePreference.firstOrNull { isProtocolCompatible(server.protocol, it) }
            runtime?.let { named to it }
        } ?: return CarrierCoreDecision(detected, baseCore, null, "no compatible profile runtime", preferences)
        return CarrierCoreDecision(
            detectedCarrier = detected,
            selectedCore = preferred.second,
            selectedNamedCore = preferred.first,
            reason = "${detected.label}: ${preferred.first.displayName} ${preferred.first.version}",
            preferences = preferences
        )
    }

    private fun isProtocolCompatible(protocol: Protocol, core: ProxyCoreType): Boolean = when (protocol) {
        Protocol.WIREGUARD -> core == ProxyCoreType.SING_BOX || core == ProxyCoreType.XRAY
        Protocol.SSH -> core == ProxyCoreType.SING_BOX
        Protocol.DNSTUNNEL, Protocol.PSIPHON -> false
        Protocol.VLESS, Protocol.VMESS, Protocol.TROJAN, Protocol.SHADOWSOCKS -> true
    }
}
