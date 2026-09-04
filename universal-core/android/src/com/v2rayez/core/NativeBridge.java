package com.v2rayez.core;
public class NativeBridge {
    static { System.loadLibrary("v2rayez_core"); }
    public native long coreInit();
    public native void coreShutdown(long handle);
    public native String coreStatus(long handle);
    public native String coreStart(long handle, String requestJson);
    public native String coreStop(long handle);
    /**
     * FFI parity counterpart of v2rayez_free_string. JNI-managed String results
     * from coreStart/coreStatus/coreStop never need it — the JNI layer copies
     * them into Java Strings and frees the native char* before returning.
     * This method exists so raw-pointer helpers added in the future have a
     * declared Java entry point matching the JNI implementation (keeping the
     * Java declaration and the JNI symbol table in lock-step).
     */
    public native void freeString(String s);
}
