/*
 * V2RayEZ Universal Core — JNI bridge.
 *
 * Links against libv2rayez_universal_core.a (Rust staticlib) and exports the
 * Java_com_v2rayez_core_NativeBridge_* symbols consumed by NativeBridge.java.
 *
 * Memory contract (mirrors v2rayez_core.h): every char* returned by the core
 * is copied into a Java String immediately and then freed with
 * v2rayez_free_string — raw pointers never cross into the JVM.
 *
 * Compiled for arm64-v8a, armeabi-v7a and x86_64 by the release pipeline
 * (see .github/workflows/release.yml) and by jni/CMakeLists.txt.
 */
#include <jni.h>
#include <string.h>
#include <stdlib.h>
#include "v2rayez_core.h"

JNIEXPORT jlong JNICALL
Java_com_v2rayez_core_NativeBridge_coreInit(JNIEnv* env, jobject thiz) {
    (void)env;  /* JNI context unused: pure FFI delegation */
    (void)thiz; /* instance receiver unused: state lives in the core handle */
    return (jlong)v2rayez_core_init();
}

JNIEXPORT void JNICALL
Java_com_v2rayez_core_NativeBridge_coreShutdown(JNIEnv* env, jobject thiz, jlong handle) {
    (void)env;
    (void)thiz;
    v2rayez_core_shutdown((void*)handle);
}

JNIEXPORT jstring JNICALL
Java_com_v2rayez_core_NativeBridge_coreStatus(JNIEnv* env, jobject thiz, jlong handle) {
    (void)thiz;
    char* s = v2rayez_core_status((void*)handle);
    jstring result = (*env)->NewStringUTF(env, s ? s : "{}");
    if (s) v2rayez_free_string(s);
    return result;
}

JNIEXPORT jstring JNICALL
Java_com_v2rayez_core_NativeBridge_coreStart(JNIEnv* env, jobject thiz, jlong handle, jstring req) {
    (void)thiz;
    /* Null-guard the Java string BEFORE GetStringUTFChars: passing a null
     * jstring to GetStringUTFChars is undefined behavior. A null request is
     * forwarded as a NULL C string, which the Rust core answers with a
     * well-formed {"allowed":false,"reason":"invalid_input"} JSON payload. */
    const char* req_c = NULL;
    if (req != NULL) {
        req_c = (*env)->GetStringUTFChars(env, req, NULL);
        /* On allocation failure GetStringUTFChars returns NULL and raises an
         * OutOfMemoryError in the JVM; forward NULL and let the core answer
         * invalid_input rather than dereferencing it. */
    }
    char* resp = v2rayez_core_start((void*)handle, req_c);
    if (req_c != NULL) {
        (*env)->ReleaseStringUTFChars(env, req, req_c);
    }
    jstring result = (*env)->NewStringUTF(env, resp ? resp : "{}");
    if (resp) v2rayez_free_string(resp);
    return result;
}

JNIEXPORT jstring JNICALL
Java_com_v2rayez_core_NativeBridge_coreStop(JNIEnv* env, jobject thiz, jlong handle) {
    (void)thiz;
    char* resp = v2rayez_core_stop((void*)handle);
    jstring result = (*env)->NewStringUTF(env, resp ? resp : "{}");
    if (resp) v2rayez_free_string(resp);
    return result;
}

JNIEXPORT void JNICALL
Java_com_v2rayez_core_NativeBridge_freeString(JNIEnv* env, jobject thiz, jstring s) {
    (void)env;
    (void)thiz;
    (void)s;
    /* Note: Java strings are managed by JVM; this is for FFI-returned char* only
     * via a helper that receives the raw pointer from native side. The JNI
     * implementations above already free every core-allocated char* before a
     * Java String is returned, so there is nothing to release here. The method
     * is intentionally kept for FFI parity with v2rayez_free_string. */
}
