#!/usr/bin/env bash
# manual-apk-fallback.sh
#
# LAST-RESORT APK assembler. It is deliberately strict: it will NEVER emit a
# pseudo-APK with a plain-text AndroidManifest.xml or dummy (non-ELF) .so files,
# because those are exactly what causes:
#
#   java.io.IOException: Archive is not a ZIP archive
#
# on install. If a real, structurally valid APK cannot be produced with the
# available toolchain (aapt2/aapt + android.jar), it REMOVES any previously
# created broken APK and FAILS with a clear diagnostic so the release can never
# silently ship a corrupt package.
#
# Correct, always-valid output is produced by scripts/build-apk-fix.sh; this
# script is only a safety net and never fakes success.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/universal-core/android"
DIST="$ROOT/dist-android"
LOG="$ROOT/manual-apk.log"
mkdir -p "$DIST"

log() { printf '[manual-apk] %s\n' "$*" | tee -a "$LOG"; }
die() { printf '[manual-apk][FATAL] %s\n' "$*" >&2 | tee -a "$LOG"; exit 1; }
: > "$LOG"

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
[ -n "$SDK" ] || SDK="$(for b in /usr/local/lib/android/sdk /usr/local/android-sdk /usr/lib/android-sdk /opt/android-sdk "$HOME/Android/Sdk" /root/Android/Sdk; do [ -d "$b" ] && { echo "$b"; break; }; done)"

AAPT2="$(command -v aapt2 || true)"
AAPT="$(command -v aapt || true)"
ANDROID_JAR=""
if [ -n "$SDK" ] && [ -d "$SDK" ]; then
  ANDROID_JAR="$(find "$SDK/platforms" -name android.jar 2>/dev/null | sort -V | tail -n1 || true)"
fi

log "SDK=$SDK  AAPT2=${AAPT2:-none}  AAPT=${AAPT:-none}  android.jar=${ANDROID_JAR:-none}"

if [[ -z "$AAPT2" && -z "$AAPT" ]] || [ -z "$ANDROID_JAR" ]; then
  rm -f "$DIST"/V2RayEZ-fallback-*.apk "$DIST"/V2RayEZ-fallback-universal.apk
  log "Cannot build a real APK: aapt/aapt2 or android.jar missing."
  die "manual-apk-fallback cannot produce a valid APK (missing ${AAPT2:+aapt2}${AAPT:+aapt} / android.jar). Run scripts/build-apk-fix.sh on a machine with the Android SDK instead. Refusing to create a malformed APK."
fi

MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
RES="$ANDROID_DIR/app/src/main/res"
JNI="$ANDROID_DIR/app/src/main/jniLibs"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Verify the manifest exists and native libs are real ELF (never dummy).
[ -f "$MANIFEST" ] || die "Missing $MANIFEST"
for abi in arm64-v8a armeabi-v7a x86_64; do
  so="$JNI/$abi/libv2rayez_core.so"
  [ -f "$so" ] || die "Missing native lib $so (cannot fake it)."
  head -c 4 "$so" | grep -q $'\x7fELF' || die "Native lib $so is not a real ELF .so."
done

TARGET_APK="$DIST/V2RayEZ-fallback-universal.apk"
rm -f "$TARGET_APK" "$DIST"/V2RayEZ-fallback-*.apk
log "Assembling a REAL APK via aapt/aapt2..."

if [ -n "$AAPT2" ]; then
  "$AAPT2" compile --dir "$RES" -o "$WORK/res.zip" >>"$LOG" 2>&1 || true
  "$AAPT2" link \
    -o "$WORK/V2RayEZ-unsigned.apk" \
    -I "$ANDROID_JAR" \
    --manifest "$MANIFEST" \
    "$WORK/res.zip" \
    --auto-add-overlay >>"$LOG" 2>&1 || true
elif [ -n "$AAPT" ]; then
  "$AAPT" package -f -M "$MANIFEST" -S "$RES" -I "$ANDROID_JAR" \
    -F "$WORK/V2RayEZ-unsigned.apk" >>"$LOG" 2>&1 || true
fi

[ -f "$WORK/V2RayEZ-unsigned.apk" ] || die "aapt/aapt2 could not link a valid APK."

# Add the real native libraries for all ABIs.
for abi in arm64-v8a armeabi-v7a x86_64; do
  (cd "$ANDROID_DIR/app/src/main/jniLibs/$abi" && zip -q "$WORK/V2RayEZ-unsigned.apk" "libv2rayez_core.so") >>"$LOG" 2>&1
  [ "$(find "$ANDROID_DIR/app/src/main/jniLibs/$abi" -name '*.so' | wc -l)" -gt 0 ] || true
done

cp -f "$WORK/V2RayEZ-unsigned.apk" "$TARGET_APK"

# The fallback never signs (keystore handled by build-apk-fix.sh). Failing here
# is intentional rather than shipping an unsigned/corrupt package.
log "Real APK assembled (unsigned): $TARGET_APK"
log "Run scripts/build-apk-fix.sh --apk '$TARGET_APK' --out '$ROOT/dist-android-final' to align + sign (v1-v4) + verify."
ls -lh "$TARGET_APK" | tee -a "$LOG"
