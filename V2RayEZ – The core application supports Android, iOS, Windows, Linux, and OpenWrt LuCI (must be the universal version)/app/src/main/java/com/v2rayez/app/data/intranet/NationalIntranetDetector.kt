package com.v2rayez.app.data.intranet

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

enum class NationalIntranetState {
    NORMAL,
    PARTIAL_RESTRICTION,
    DOMESTIC_ONLY,
    OFFLINE
}

data class ProbeTarget(
    val name: String,
    val url: String
)

data class ProbeOutcome(
    val target: ProbeTarget,
    val reachable: Boolean,
    val statusCode: Int = -1,
    val error: String = ""
)

data class NationalIntranetReport(
    val state: NationalIntranetState,
    val domestic: List<ProbeOutcome>,
    val international: List<ProbeOutcome>
) {
    val domesticReachable: Int get() = domestic.count { it.reachable }
    val internationalReachable: Int get() = international.count { it.reachable }
    val domesticSummary: String get() = "${domesticReachable}/${domestic.size}"
    val internationalSummary: String get() = "${internationalReachable}/${international.size}"
}

/**
 * Shutdown-aware connectivity classifier for the Android V2RayEZ Diagnostics screen.
 *
 * It is deliberately honest: it can detect domestic-only / partial-restriction symptoms and
 * explain serverless limits, but it does not claim that a phone can reach the global internet
 * with no reachable server, peer, relay, or gateway. Results are local to the device and are not
 * uploaded by this class.
 */
@Singleton
class NationalIntranetDetector @Inject constructor(baseHttp: OkHttpClient) {
    private val http = baseHttp.newBuilder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .build()

    suspend fun detect(
        domesticTargets: List<ProbeTarget> = DOMESTIC_TARGETS,
        internationalTargets: List<ProbeTarget> = INTERNATIONAL_TARGETS
    ): NationalIntranetReport = coroutineScope {
        val domestic = domesticTargets.map { async { probe(it) } }.map { it.await() }
        val international = internationalTargets.map { async { probe(it) } }.map { it.await() }
        NationalIntranetReport(classify(domestic, international), domestic, international)
    }

    private suspend fun probe(target: ProbeTarget): ProbeOutcome = withContext(Dispatchers.IO) {
        runCatching {
            http.newCall(
                Request.Builder()
                    .url(target.url)
                    .header("User-Agent", "V2RayEZ-Android-National-Intranet-Probe/1.0")
                    .get()
                    .build()
            ).execute().use { response ->
                ProbeOutcome(
                    target = target,
                    reachable = response.code in 200..399 || response.code == 403 || response.code == 405,
                    statusCode = response.code
                )
            }
        }.getOrElse { error ->
            ProbeOutcome(target, reachable = false, error = error.message.orEmpty())
        }
    }

    private fun classify(domestic: List<ProbeOutcome>, international: List<ProbeOutcome>): NationalIntranetState {
        val domesticOk = domestic.any { it.reachable }
        val internationalOk = international.any { it.reachable }
        val internationalMostlyDown = international.count { it.reachable } * 2 < international.size
        return when {
            !domesticOk && !internationalOk -> NationalIntranetState.OFFLINE
            domesticOk && !internationalOk -> NationalIntranetState.DOMESTIC_ONLY
            domesticOk && internationalMostlyDown -> NationalIntranetState.PARTIAL_RESTRICTION
            else -> NationalIntranetState.NORMAL
        }
    }

    companion object {
        val DOMESTIC_TARGETS = listOf(
            ProbeTarget("Aparat", "https://www.aparat.com/"),
            ProbeTarget("Telewebion", "https://telewebion.com/"),
            ProbeTarget("Shaparak", "https://www.shaparak.ir/")
        )

        val INTERNATIONAL_TARGETS = listOf(
            ProbeTarget("Google 204", "https://www.gstatic.com/generate_204"),
            ProbeTarget("Apple", "https://www.apple.com/library/test/success.html"),
            ProbeTarget("Wikipedia", "https://www.wikipedia.org/")
        )
    }
}
