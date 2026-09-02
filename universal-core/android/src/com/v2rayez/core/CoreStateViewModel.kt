package com.v2rayez.core;

import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

/**
 * Kotlin ViewModel glue — binds Universal-Core FFI state machine to reactive UI.
 * All operations delegate to NativeBridge (JNI) which calls finalized FFI only.
 * Memory: NativeBridge handles v2rayez_free_string; ViewModel never holds raw pointers.
 */
public class CoreStateViewModel extends ViewModel {
    private final MutableLiveData<String> statusLiveData = new MutableLiveData<>("{}");
    private final MutableLiveData<Boolean> runningLiveData = new MutableLiveData<>(false);
    private long nativeHandle = 0;

    public LiveData<String> getStatus() { return statusLiveData; }
    public LiveData<Boolean> getRunning() { return runningLiveData; }

    public void initCore() {
        nativeHandle = new NativeBridge().coreInit();
    }

    public void startCore(String json) {
        if (nativeHandle == 0) return;
        String resp = new NativeBridge().coreStart(nativeHandle, json);
        statusLiveData.postValue(resp);
        runningLiveData.postValue(true);
    }

    public void stopCore() {
        if (nativeHandle == 0) return;
        String resp = new NativeBridge().coreStop(nativeHandle);
        statusLiveData.postValue(resp);
        runningLiveData.postValue(false);
    }

    public void pollStatus() {
        if (nativeHandle == 0) return;
        // Off main thread via ViewModel + LiveData observer; actual polling
        // should use Coroutine / ThreadPool in production.
        String resp = new NativeBridge().coreStatus(nativeHandle);
        statusLiveData.postValue(resp);
    }

    public void shutdownCore() {
        if (nativeHandle != 0) {
            new NativeBridge().coreShutdown(nativeHandle);
            nativeHandle = 0;
        }
    }

    @Override
    protected void onCleared() {
        shutdownCore();
        super.onCleared();
    }
}
