package com.v2rayez.app.data.privacy

import android.content.Context
import com.v2rayez.app.data.local.DailyTrafficDao
import com.v2rayez.app.data.local.SessionDao
import com.v2rayez.app.data.license.AndroidLicenseRepository
import com.v2rayez.app.domain.repository.EmergencyPrivacyCleanup
import com.v2rayez.app.domain.repository.LogRepository
import com.v2rayez.app.domain.repository.PrivacyCleanupResult
import com.v2rayez.app.domain.repository.VpnController
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Defensive local privacy cleanup for the device owner.
 *
 * This does not attack, bypass, or tamper with any third-party system and it does not promise
 * anonymity. It only stops this app's active tunnel and removes V2RayEZ-local traces/secrets that
 * can identify the user's connection history on the device: in-memory logs, persisted traffic
 * history, exported log files in app cache, and locally stored license/grace/device binding data.
 * Server-side audit records remain on the license server and must be managed there.
 */
@Singleton
class AndroidEmergencyPrivacyCleanup @Inject constructor(
    @ApplicationContext private val context: Context,
    private val vpn: VpnController,
    private val logs: LogRepository,
    private val sessionDao: SessionDao,
    private val dailyTrafficDao: DailyTrafficDao,
    private val licenseRepository: AndroidLicenseRepository
) : EmergencyPrivacyCleanup {

    override suspend fun wipeLocalTraces(): PrivacyCleanupResult = withContext(Dispatchers.IO) {
        val cleared = mutableListOf<String>()
        val errors = mutableListOf<String>()

        suspend fun step(label: String, block: suspend () -> Unit) {
            runCatching { block() }
                .onSuccess { cleared += label }
                .onFailure { errors += "$label: ${it.message ?: it.javaClass.simpleName}" }
        }

        step("active_tunnel_disconnect") { vpn.disconnect() }
        step("in_memory_logs") { logs.clear() }
        step("session_history") { sessionDao.deleteAll() }
        step("daily_traffic_history") { dailyTrafficDao.deleteAll() }
        step("local_license_and_grace") { licenseRepository.clear() }
        step("exported_log_cache") { deleteChildren(File(context.cacheDir, "logs")) }
        step("bugreport_cache") { deleteChildren(File(context.cacheDir, "bugreports")) }
        step("webview_cache") { deleteChildren(File(context.cacheDir, "WebView")) }

        PrivacyCleanupResult(cleared = cleared, errors = errors)
    }

    private fun deleteChildren(root: File) {
        if (!root.exists()) return
        root.listFiles()?.forEach { child ->
            if (child.isDirectory) child.deleteRecursively() else child.delete()
        }
    }
}
