package com.v2rayez.core

import android.content.Intent
import android.os.ParcelFileDescriptor

/**
 * Minimal VpnService that shows how the core would be used for TUN.
 * Actual tunnel activation delegates to NativeBridge FFI.
 *
 * The supertype is referenced by its fully-qualified name on purpose: this
 * class intentionally keeps the simple name `VpnService` (the manifest declares
 * `.VpnService`), and qualifying `android.net.VpnService` removes any
 * self-name ambiguity in the supertype resolution.
 */
class VpnService : android.net.VpnService() {

    private var vpnInterface: ParcelFileDescriptor? = null
    private var nativeHandle: Long = 0

    /** Last JSON response returned by the core's FFI start command. Retained
     *  so callers/diagnostics can inspect the outcome instead of dropping it
     *  (also keeps the value visibly used — no unused-variable warning). */
    @Volatile
    private var lastStartResponse: String? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val bridge = NativeBridge()
            nativeHandle = bridge.coreInit()
            // In real implementation, BuildConfig would contain license etc.
            val requestJson = """{"command":"Start","profile_id":"default","account_id":"android","device_id":"android-device","platform":"android","signed_license_key":""}"""
            lastStartResponse = bridge.coreStart(nativeHandle, requestJson)
            // Setup TUN interface
            val builder = Builder()
                .addAddress("10.0.0.2", 32)
                .addRoute("0.0.0.0", 0)
                .addDnsServer("1.1.1.1")
                .setSession("V2RayEZ")
                .setMtu(1500)
            vpnInterface = builder.establish()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        try {
            if (nativeHandle != 0L) {
                NativeBridge().coreStop(nativeHandle)
                NativeBridge().coreShutdown(nativeHandle)
                nativeHandle = 0
            }
            vpnInterface?.close()
        } catch (_: Exception) {}
        super.onDestroy()
    }
}
