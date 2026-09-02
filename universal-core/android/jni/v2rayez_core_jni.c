#include <jni.h>
#include <string.h>
#include <stdlib.h>
#include "v2rayez_core.h"

JNIEXPORT jlong JNICALL
Java_com_v2rayez_core_NativeBridge_coreInit(JNIEnv* env, jobject thiz) {
    return (jlong)v2rayez_core_init();
}

JNIEXPORT void JNICALL
Java_com_v2rayez_core_NativeBridge_coreShutdown(JNIEnv* env, jobject thiz, jlong handle) {
    v2rayez_core_shutdown((void*)handle);
}

JNIEXPORT jstring JNICALL
Java_com_v2rayez_core_NativeBridge_coreStatus(JNIEnv* env, jobject thiz, jlong handle) {
    char* s = v2rayez_core_status((void*)handle);
    jstring result = (*env)->NewStringUTF(env, s ? s : "{}");
    if (s) v2rayez_free_string(s);
    return result;
}

JNIEXPORT jstring JNICALL
Java_com_v2rayez_core_NativeBridge_coreStart(JNIEnv* env, jobject thiz, jlong handle, jstring req) {
    const char* req_c = (*env)->GetStringUTFChars(env, req, NULL);
    char* resp = v2rayez_core_start((void*)handle, req_c);
    (*env)->ReleaseStringUTFChars(env, req, req_c);
    jstring result = (*env)->NewStringUTF(env, resp ? resp : "{}");
    if (resp) v2rayez_free_string(resp);
    return result;
}

JNIEXPORT jstring JNICALL
Java_com_v2rayez_core_NativeBridge_coreStop(JNIEnv* env, jobject thiz, jlong handle) {
    char* resp = v2rayez_core_stop((void*)handle);
    jstring result = (*env)->NewStringUTF(env, resp ? resp : "{}");
    if (resp) v2rayez_free_string(resp);
    return result;
}

JNIEXPORT void JNICALL
Java_com_v2rayez_core_NativeBridge_freeString(JNIEnv* env, jobject thiz, jstring s) {
    // Note: Java strings are managed by JVM; this is for FFI-returned char* only
    // via a helper that receives the raw pointer from native side.
}
