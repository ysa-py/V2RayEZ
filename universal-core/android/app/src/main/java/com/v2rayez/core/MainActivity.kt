package com.v2rayez.core

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider

/**
 * Minimal MainActivity that demonstrates Universal Core FFI integration
 * via NativeBridge + CoreStateViewModel. This is the entry point for the
 * end-user APK (not raw .a library). Multi-ABI APKs are produced via
 * Gradle splits (arm64-v8a, armeabi-v7a, x86_64).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var viewModel: CoreStateViewModel
    private lateinit var statusView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        statusView = TextView(this).apply {
            text = "V2RayEZ Universal Core\nInitializing..."
            textSize = 16f
            setPadding(32, 32, 32, 32)
        }
        setContentView(statusView)

        viewModel = ViewModelProvider(this)[CoreStateViewModel::class.java]

        viewModel.getStatus().observe(this) { status ->
            statusView.text = "V2RayEZ Universal Core\n\nStatus: $status\n\nCore initialized via FFI.\nJNI lib: libv2rayez_core.so\nABIs: arm64-v8a, armeabi-v7a, x86_64"
        }

        viewModel.getRunning().observe(this) { running ->
            if (running) {
                statusView.append("\n\nRunning: true")
            }
        }

        try {
            viewModel.initCore()
            viewModel.pollStatus()
            statusView.append("\n\nCore init OK - handle created")
        } catch (e: Exception) {
            statusView.append("\n\nCore init failed: ${e.message}")
        }
    }

    override fun onDestroy() {
        try {
            viewModel.shutdownCore()
        } catch (_: Exception) {}
        super.onDestroy()
    }
}
