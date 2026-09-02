#!/usr/bin/env bash
# Build Android APK from universal-core JNI libs
# Preserves multi-ABI: arm64-v8a, armeabi-v7a, x86_64
# Automated retry, caching, detailed logging
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/universal-core/android"
DIST="$ROOT/dist-android"
LOG="$ROOT/android-build.log"

mkdir -p "$DIST"

log() { echo "[android] $*" | tee -a "$LOG"; }

retry() {
  local max=3
  local count=0
  local delay=5
  while true; do
    if "$@" 2>&1 | tee -a "$LOG"; then
      return 0
    fi
    count=$((count+1))
    if [[ $count -ge $max ]]; then
      log "FAILED after $max attempts: $*"
      return 1
    fi
    log "Retry $count/$max after ${delay}s: $*"
    sleep $delay
    delay=$((delay*2))
  done
}

log "Preparing Android project at $ANDROID_DIR"
ls -la "$ANDROID_DIR" | tee -a "$LOG" || true

# Ensure jniLibs exist
for abi in arm64-v8a armeabi-v7a x86_64; do
  mkdir -p "$ANDROID_DIR/app/src/main/jniLibs/$abi"
done

# If gradle wrapper missing, create minimal wrapper properties
if [[ ! -f "$ANDROID_DIR/gradle/wrapper/gradle-wrapper.properties" ]]; then
  mkdir -p "$ANDROID_DIR/gradle/wrapper"
  cat > "$ANDROID_DIR/gradle/wrapper/gradle-wrapper.properties" <<'PROP'
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
PROP
fi

# Ensure gradlew exists or use system gradle
if [[ ! -f "$ANDROID_DIR/gradlew" ]]; then
  if command -v gradle >/dev/null 2>&1; then
    log "Generating gradle wrapper via system gradle"
    (cd "$ANDROID_DIR" && gradle wrapper --gradle-version 8.7 2>&1 | tee -a "$LOG" || true)
  else
    log "No gradle wrapper, will attempt to build with gradle directly"
  fi
fi

# Build
cd "$ANDROID_DIR"
if [[ -f "./gradlew" ]]; then
  chmod +x ./gradlew
  log "Running ./gradlew assembleDebug"
  retry ./gradlew assembleDebug --stacktrace
  # Also try release (unsigned will be produced if no signing config)
  log "Running ./gradlew assembleRelease (may need signing, fallback to debug)"
  ./gradlew assembleRelease --stacktrace 2>&1 | tee -a "$LOG" || log "Release build requires signing, using debug APK"
else
  log "Using system gradle"
  retry gradle assembleDebug --stacktrace
fi

cd "$ROOT"
find "$ANDROID_DIR" -type f -name "*.apk" -exec ls -lh {} \; | tee -a "$LOG"
find "$ANDROID_DIR" -type f -name "*.apk" -exec cp -v {} "$DIST/" \; | tee -a "$LOG" || true

if [[ -z "$(ls -A "$DIST" 2>/dev/null)" ]]; then
  log "No APK produced by gradle, invoking manual fallback"
  bash "$ROOT/scripts/manual-apk-fallback.sh" || true
fi

log "Final APKs:"
ls -lh "$DIST/" | tee -a "$LOG" || true
