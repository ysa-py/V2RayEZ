# MICAFP — R8 keep rules (release minification)
# Preserve JNI / VPN / reflection entry points. Do not strip protocols.
-keepclasseswithmembernames class * {
    native <methods>;
}
-keep class com.unifiedshield.** { *; }
-keep class com.unifiedshield.VpnService { *; }
-keep class com.unifiedshield.BootReceiver { *; }
-keep class com.unifiedshield.UnifiedShieldTileService { *; }
-keep class com.unifiedshield.MainActivity { *; }
# Gson reflection models (license payload, AI provider config/registry, audit records)
-keep class com.unifiedshield.license.MicafpLicensePayload { *; }
-keep class com.unifiedshield.license.AuditRecord { *; }
-keep class com.unifiedshield.aiproviders.AiProviderUserConfig { *; }
-keep class com.unifiedshield.aiproviders.AiProviderDefinition { *; }
-keep class com.unifiedshield.aiproviders.AiProviderRegistryFile { *; }
-keep class com.unifiedshield.tunnel.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
# Google Tink
-keep class com.google.crypto.tink.** { *; }
# OkHttp platform warnings
-dontwarn okhttp3.internal.platform.**
-dontwarn org.codehaus.mojo.animal_sniffer.*
