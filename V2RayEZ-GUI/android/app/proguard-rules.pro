# Native JNI entry points are registered by HEV's JNI_OnLoad.
-keep class hev.htproxy.TProxyService { *; }
-keep class app.v2rayez.gui.** { *; }
-keepclasseswithmembernames class * {
    native <methods>;
}
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn okhttp3.internal.platform.**
