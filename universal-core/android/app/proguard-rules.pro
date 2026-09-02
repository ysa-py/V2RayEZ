# Keep FFI bridge
-keep class com.v2rayez.core.NativeBridge { *; }
-keep class com.v2rayez.core.CoreStateViewModel { *; }
-keep class com.v2rayez.core.MainActivity { *; }
# Keep JNI
-keepclasseswithmembernames class * {
    native <methods>;
}
