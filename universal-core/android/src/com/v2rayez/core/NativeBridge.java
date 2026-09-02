package com.v2rayez.core;
public class NativeBridge {
    static { System.loadLibrary("v2rayez_core"); }
    public native long coreInit();
    public native void coreShutdown(long handle);
    public native String coreStatus(long handle);
    public native String coreStart(long handle, String requestJson);
    public native String coreStop(long handle);
    /* Memory ownership: all String results from coreStart/coreStatus/coreStop
       are Java String copies; the underlying native char* is freed by JNI
       before return (see jni implementation). For full FFI parity, expose
       a freeNativeString helper if passing raw pointers back to Java. */
}
