package com.v2rayez.app.data.routing

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.v2rayez.app.domain.model.Server
import dagger.hilt.android.qualifiers.ApplicationContext
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.roundToInt

/**
 * UAC-style adaptive route memory for the Android V2RayEZ power button.
 *
 * It keeps per-network-class champion/backup route scores without storing phone numbers,
 * subscriber ids, BSSIDs, local IPs, full carrier identifiers, or destination secrets. The
 * fingerprint is intentionally coarse (`wifi`/`cellular`/`ethernet` + metered/roaming flags) so
 * it helps future connects on similar networks while avoiding identifiable telemetry.
 */
interface AdaptiveRouteMemory {
    fun rank(servers: List<Server>, limit: Int = servers.size): List<Server>
    fun recordSuccess(server: Server, pingMs: Int, coreLabel: String)
    fun recordFailure(serverId: String, reason: String)
    fun currentFingerprint(): String
}

object NoopAdaptiveRouteMemory : AdaptiveRouteMemory {
    override fun rank(servers: List<Server>, limit: Int): List<Server> = servers.take(limit)
    override fun recordSuccess(server: Server, pingMs: Int, coreLabel: String) = Unit
    override fun recordFailure(serverId: String, reason: String) = Unit
    override fun currentFingerprint(): String = "preview"
}

@Singleton
class AndroidAdaptiveRouteMemory @Inject constructor(
    @ApplicationContext context: Context
) : AdaptiveRouteMemory {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun rank(servers: List<Server>, limit: Int): List<Server> {
        if (servers.isEmpty()) return emptyList()
        val profile = loadProfile(currentFingerprint())
        val now = System.currentTimeMillis()
        val index = servers.mapIndexed { i, server -> server.id to i }.toMap()
        return servers.sortedWith(
            compareByDescending<Server> { server -> score(profile.optJSONObject(server.id), server, now) }
                .thenBy { server -> index[server.id] ?: Int.MAX_VALUE }
        ).take(limit.coerceIn(1, servers.size))
    }

    override fun recordSuccess(server: Server, pingMs: Int, coreLabel: String) {
        if (server.id.isBlank() || server.id == "tor-device" || server.id == "mitm") return
        val fp = currentFingerprint()
        val profile = loadProfile(fp)
        val route = profile.optJSONObject(server.id) ?: JSONObject()
        val now = System.currentTimeMillis()
        val oldEwma = route.optDouble("ewmaMs", server.pingMs.takeIf { it > 0 }?.toDouble() ?: 0.0)
        val sample = pingMs.takeIf { it > 0 } ?: server.pingMs.takeIf { it > 0 } ?: 1500
        val ewma = if (oldEwma > 0.0) oldEwma * 0.70 + sample * 0.30 else sample.toDouble()
        route.put("success", route.optInt("success", 0) + 1)
        route.put("failure", route.optInt("failure", 0).coerceAtMost(10))
        route.put("ewmaMs", ewma.roundToInt())
        route.put("lastSuccessAt", now)
        route.put("cooldownUntil", 0L)
        route.put("protocol", server.protocol.name)
        route.put("core", coreLabel)
        profile.put(server.id, route)
        saveProfile(fp, profile)
    }

    override fun recordFailure(serverId: String, reason: String) {
        if (serverId.isBlank() || serverId == "tor-device" || serverId == "mitm") return
        val fp = currentFingerprint()
        val profile = loadProfile(fp)
        val route = profile.optJSONObject(serverId) ?: JSONObject()
        val failures = route.optInt("failure", 0) + 1
        val now = System.currentTimeMillis()
        route.put("failure", failures)
        route.put("lastFailureAt", now)
        route.put("cooldownUntil", now + cooldownMs(failures, reason))
        profile.put(serverId, route)
        saveProfile(fp, profile)
    }

    override fun currentFingerprint(): String {
        val cm = appContext.getSystemService(ConnectivityManager::class.java) ?: return "android:unknown"
        val caps = runCatching { cm.getNetworkCapabilities(cm.activeNetwork) }.getOrNull()
            ?: return "android:unknown"
        val transports = buildList {
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) add("wifi")
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) add("cellular")
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) add("ethernet")
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) add("vpn")
            if (isEmpty()) add("other")
        }.sorted().joinToString("+")
        val metered = runCatching { cm.isActiveNetworkMetered }.getOrDefault(false)
        val notRoaming = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_ROAMING)
        val validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        return "android:$transports:metered=$metered:notRoaming=$notRoaming:validated=$validated"
    }

    private fun score(route: JSONObject?, server: Server, now: Long): Double {
        val routeScore = if (route == null) 0.0 else {
            val success = route.optInt("success", 0)
            val failure = route.optInt("failure", 0)
            val ewma = route.optDouble("ewmaMs", server.pingMs.takeIf { it > 0 }?.toDouble() ?: 1500.0)
            val cooldownPenalty = if (route.optLong("cooldownUntil", 0L) > now) 10_000.0 else 0.0
            val recentBonus = if (now - route.optLong("lastSuccessAt", 0L) < RECENT_SUCCESS_MS) 250.0 else 0.0
            success * 500.0 - failure * 650.0 - ewma / 4.0 - cooldownPenalty + recentBonus
        }
        val measuredPingBonus = if (server.pingMs > 0) 200.0 - (server.pingMs / 10.0) else 0.0
        val favoriteBonus = if (server.isFavorite) 75.0 else 0.0
        return routeScore + measuredPingBonus + favoriteBonus
    }

    private fun cooldownMs(failures: Int, reason: String): Long {
        val base = when {
            reason.contains("license", ignoreCase = true) -> 0L
            reason.contains("missing", ignoreCase = true) -> 30 * 60_000L
            else -> 60_000L
        }
        if (base == 0L) return 0L
        val multiplier = failures.coerceIn(1, 8)
        return base * multiplier
    }

    private fun loadProfile(fingerprint: String): JSONObject =
        runCatching { JSONObject(prefs.getString(key(fingerprint), "{}") ?: "{}") }
            .getOrDefault(JSONObject())

    private fun saveProfile(fingerprint: String, profile: JSONObject) {
        prefs.edit().putString(key(fingerprint), profile.toString()).apply()
    }

    private fun key(fingerprint: String): String = "profile.${fingerprint.hashCode()}"

    companion object {
        private const val PREFS = "v2rayez_adaptive_routes"
        private const val RECENT_SUCCESS_MS = 7L * 24 * 60 * 60 * 1000
    }
}
