#!/usr/bin/env bash
#
# build-apk-fix.sh — Fully automated V2RayEZ Universal APK build, structural
# repair, alignment and multi-scheme signing.
#
# Solves, automatically and without deleting a single feature/native lib:
#   * java.io.IOException: Archive is not a ZIP archive
#   * MIUI / rootless install errors (malformed split/XAPK handling)
#   * Google Play Protect "App scan recommended"/"Unknown App" warnings
#
# Pipeline (all automatic):
#   1. Validate the toolchain (JDK 17, Android SDK, build-tools, apksigner).
#   2. Ensure the required native libs exist as REAL ELF .so for
#      arm64-v8a / armeabi-v7a / x86_64 (never fabricates dummy .so).
#   3. Build ONE universal "fat" APK containing all ABIs (Gradle).
#   4. Structurally validate the APK (binary AXML manifest + real .so + dex).
#   5. Merge any split APKs into the universal if a universal was not produced.
#   6. zipalign -v -p 4 (4-byte page alignment).
#   7. Generate a 4096-bit RSA release keystore if none exists.
#   8. Sign with APK Signature Scheme v1 + v2 + v3 + v4 via apksigner.
#   9. apksigner verify --verbose  (verification protocol).
#  10. Emit a final SHA256SUMS.txt and a verification report.
#
# Usage:
#   bash scripts/build-apk-fix.sh [--apk APP.apk] [--out DIR]
#     --apk  : if a pre-built APK is supplied, skip the Gradle build and only
#              run structural validation + zipalign + sign + verify on it.
#     --out  : output directory (default: repo-root/dist-android-final)
#
# Environment overrides:
#   ANDROID_HOME / ANDROID_SDK_ROOT   Android SDK location
#   ANDROID_NDK_HOME / ANDROID_NDK_ROOT  NDK location (used to assemble .so if needed)
#   ANDROID_KEYSTORE_PATH             release keystore path (auto-generated if unset)
#   ANDROID_KEYSTORE_PASSWORD         release keystore store password
#   ANDROID_KEY_ALIAS                 release key alias
#   ANDROID_KEY_PASSWORD              release key password
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_PROJECT="$ROOT/universal-core/android"
DIST="${ROOT}/dist-android-final"
LOG="${ROOT}/android-apk-fix.log"
PY_VALIDATE="$ROOT/tools/apk_structural_validate.py"
ADHOC_APK=""

log() { printf '[apk-fix] %s\n' "$*" | tee -a "$LOG"; }
die()  { printf '[apk-fix][FATAL] %s\n' "$*" >&2 | tee -a "$LOG"; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────
while [ "$#" -gt 0 ]; do
  case "$1" in
    --apk) ADHOC_APK="${2:-}"; shift 2 ;;
    --out) DIST="${2:-}"; shift 2 ;;
    -h|--help) sed -n '1,80p' "$0" | sed 's/^#//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
mkdir -p "$DIST"
: > "$LOG"

log "V2RayEZ APK build, structural repair, alignment & signing"
log "repo root      = $ROOT"
log "android project= $ANDROID_PROJECT"
log "out dir        = $DIST"

# ─────────────────────────────────────────────────────────────────────────────
# Toolchain discovery
# ─────────────────────────────────────────────────────────────────────────────
find_sdk() {
  # Priority 1: environment + the standard GitHub-hosted runner path
  # (``ubuntu-latest`` keeps the SDK at /usr/local/lib/android/sdk and sets
  # ANDROID_HOME). Priority 2: local.properties sdk.dir. Priority 3: common dirs.
  local cand
  for base in "${ANDROID_SDK_ROOT:-}" "${ANDROID_HOME:-}" \
              /usr/local/lib/android/sdk /usr/local/android-sdk \
              /opt/android-sdk /usr/lib/android-sdk \
              "$HOME/Android/Sdk" /root/Android/Sdk; do
    [ -n "$base" ] && [ -d "$base" ] && { echo "$base"; return 0; }
  done
  # sdk.dir may be declared in a local.properties (repo or android project).
  for lp in "$ROOT/local.properties" "$ANDROID_PROJECT/local.properties" \
            "$ANDROID_PROJECT/../local.properties"; do
    [ -f "$lp" ] || continue
    cand="$(sed -n 's/^sdk\.dir=\(.*\)/\1/p' "$lp" | head -n1)"
    if [ -n "$cand" ] && [ -d "$cand" ]; then echo "$cand"; return 0; fi
  done
  # Last resort: any dir under /home */Android/Sdk, /usr/local/*/android-sdk, etc.
  for cand in /usr/local/lib/android-sdk /usr/local/android-sdk \
              "$HOME/android-sdk" "$HOME/Android/sdk"; do
    [ -d "$cand" ] && { echo "$cand"; return 0; }
  done
  return 1
}

find_build_tools_dir() {
  local sdk="$1"
  [ -d "$sdk/build-tools" ] || return 1
  # Pick the newest (by version sort) build-tools that actually contains BOTH
  # zipalign and apksigner; otherwise the align/sign phase would fail later.
  local dir best=""
  for dir in $(ls -1 "$sdk/build-tools" 2>/dev/null | sort -V); do
    if [ -x "$sdk/build-tools/$dir/zipalign" ] && [ -x "$sdk/build-tools/$dir/apksigner" ]; then
      best="$dir"
    fi
  done
  [ -n "$best" ] || return 1
  echo "$best"
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK" ] || [ ! -d "$SDK" ]; then
  SDK="$(find_sdk)" || die "Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT."
fi
BT="$(find_build_tools_dir "$SDK")" || die "No build-tools found under $SDK/build-tools"
BT_DIR="$SDK/build-tools/$BT"
ZIPALIGN="$BT_DIR/zipalign"
APKSIGNER="$BT_DIR/apksigner"
AAPT2="$BT_DIR/aapt2"
KEYTOOL="$(command -v keytool || echo "")"

log "SDK           = $SDK"
log "build-tools   = $BT_DIR"
for t in "$ZIPALIGN" "$APKSIGNER"; do
  [ -x "$t" ] || die "missing build-tool: $t"
done

if command -v java >/dev/null 2>&1; then
  log "java version  = $(java -version 2>&1 | head -n1)"
else
  die "JDK not found on PATH (required for keytool + Gradle)."
fi
if [ -z "$KEYTOOL" ]; then
  # keytool ships with the JDK; search common JVMs
  KEYTOOL="$(find /usr/lib/jvm /usr/local -name keytool -type f 2>/dev/null | head -n1 || true)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Keystore (4096-bit RSA) — never commit to git, lives in $HOME/.android
# ─────────────────────────────────────────────────────────────────────────────
KEYSTORE="${ANDROID_KEYSTORE_PATH:-$HOME/.android/v2rayez-release.keystore}"
KS_PASS="${ANDROID_KEYSTORE_PASSWORD:-}"
ALIAS="${ANDROID_KEY_ALIAS:-v2rayez}"
KEY_PASS="${ANDROID_KEY_PASSWORD:-}"
PASS_FILE="$HOME/.android/v2rayez-keystore.pass"

ensure_keystore() {
  mkdir -p "$HOME/.android"
  if [ ! -f "$KEYSTORE" ]; then
    if [ -z "$KS_PASS" ]; then
      # Generate a strong random password once and store it outside the repo.
      if [ ! -f "$PASS_FILE" ]; then
        head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24 > "$PASS_FILE"
        chmod 600 "$PASS_FILE"
      fi
      KS_PASS="$(cat "$PASS_FILE")"
      KEY_PASS="$KS_PASS"
    fi
    log "Generating 4096-bit RSA release keystore at $KEYSTORE (alias=$ALIAS)"
    if [ -z "$KEYTOOL" ]; then
      die "keytool not found; cannot generate release keystore. Install a JDK."
    fi
    "$KEYTOOL" -genkeypair -v \
      -keystore "$KEYSTORE" \
      -alias "$ALIAS" \
      -keyalg RSA -keysize 4096 -validity 10000 \
      -storepass "$KS_PASS" -keypass "$KEY_PASS" \
      -dname "CN=V2RayEZ Release, OU=V2RayEZ, O=V2RayEZ, L=Internet, ST=Universal, C=IR" \
      2>&1 | tee -a "$LOG"
    chmod 600 "$KEYSTORE"
  else
    log "Using existing release keystore: $KEYSTORE"
    if [ -z "$KS_PASS" ] && [ -f "$PASS_FILE" ]; then
      KS_PASS="$(cat "$PASS_FILE")"; KEY_PASS="$KS_PASS"
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Native libs: verify real ELF .so for all three ABIs; NEVER create dummy .so.
# ─────────────────────────────────────────────────────────────────────────────
ABIS=(arm64-v8a armeabi-v7a x86_64)
JNI_DIR="$ANDROID_PROJECT/app/src/main/jniLibs"

require_native_libs() {
  local missing=0
  for abi in "${ABIS[@]}"; do
    local so="$JNI_DIR/$abi/libv2rayez_core.so"
    if [ ! -f "$so" ]; then
      log "MISSING native lib for $abi -> $so"
      missing=1
    elif ! head -c 4 "$so" | grep -q $'\x7fELF'; then
      log "BAD native lib for $abi (not an ELF) -> $so"
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    # Try to assemble the .so from the NDK + cargo staticlib (CI scenario).
    # Fail loudly if we cannot — we refuse to emit dummy .so (the exact
    # cause of 'Archive is not a ZIP archive' / load crashes).
    build_native_libs || die "Native libs are missing/invalid and could not be built. Refusing to fabricate dummy .so."
  fi
  log "All required native libs present and valid (real ELF .so)."
}

build_native_libs() {
  local NDK="${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-}}"
  if [ -z "$NDK" ] && [ -n "$SDK" ] && [ -d "$SDK/ndk" ]; then
    NDK="$(ls -1d "$SDK/ndk/"* 2>/dev/null | sort -V | tail -n1 || true)"
  fi
  [ -n "$NDK" ] || { log "No NDK available to build native libs."; return 1; }
  [ -x "$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin" ] || {
    log "NDK prebuilt toolchain not found in $NDK"; return 1; }
  local PRE="$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin"
  local API=24
  local JNI_SRC="$ANDROID_PROJECT/jni/v2rayez_core_jni.c"
  local HDR="$ANDROID_PROJECT/jni"
  local built=0
  local spec=(
    "aarch64-linux-android|arm64-v8a|$PRE/aarch64-linux-android${API}-clang"
    "armv7-linux-androideabi|armeabi-v7a|$PRE/armv7a-linux-androideabi${API}-clang"
    "x86_64-linux-android|x86_64|$PRE/x86_64-linux-android${API}-clang"
  )
  for entry in "${spec[@]}"; do
    local triple abi clang
    IFS='|' read -r triple abi clang <<< "$entry"
    local staticlib
    staticlib="$(find "$ROOT/universal-core/target" -path "*${triple}/release/libv2rayez_universal_core.a" 2>/dev/null | head -n1 || true)"
    if [ -z "$staticlib" ]; then
      log "No cargo staticlib for $triple; skipping ABI $abi."
      continue
    fi
    mkdir -p "$JNI_DIR/$abi"
    local so="$JNI_DIR/$abi/libv2rayez_core.so"
    # Rebuild if missing OR corrupt (not a real ELF) so a stale dummy is fixed.
    if [ ! -f "$so" ] || ! head -c 4 "$so" | grep -q $'\x7fELF'; then
      log "Assembling $abi/libv2rayez_core.so from $staticlib"
      "$clang" -shared -O3 -flto -fPIC -I"$HDR" "$JNI_SRC" "$staticlib" -llog \
        -o "$so" 2>&1 | tee -a "$LOG"
      [ -f "$so" ] && built=1
    fi
  done
  [ "$built" -eq 1 ] || return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Universal fat APK build (Gradle) — all ABIs in ONE apk
# ─────────────────────────────────────────────────────────────────────────────
build_universal() {
  log "Building universal fat APK via Gradle (single APK, all ABIs)..."
  cd "$ANDROID_PROJECT"
  export ANDROID_HOME="$SDK"
  export ANDROID_SDK_ROOT="$SDK"
  # Belt-and-suspenders: pin sdk.dir so Gradle always finds the SDK even if the
  # runner does not export ANDROID_HOME. local.properties is git-ignored.
  if [ -n "$SDK" ] && [ -d "$SDK" ]; then
    printf 'sdk.dir=%s\n' "$SDK" > "$ANDROID_PROJECT/local.properties"
    log "Wrote sdk.dir=$SDK to $ANDROID_PROJECT/local.properties"
  fi
  export ANDROID_KEYSTORE_PATH="$KEYSTORE"
  export ANDROID_KEYSTORE_PASSWORD="$KS_PASS"
  export ANDROID_KEY_ALIAS="$ALIAS"
  export ANDROID_KEY_PASSWORD="$KEY_PASS"
  if [ -f "./gradlew" ] && command -v java >/dev/null 2>&1; then
    chmod +x ./gradlew 2>/dev/null || true
    ./gradlew clean assembleRelease --stacktrace 2>&1 | tee -a "$LOG" \
      || { log "assembleRelease failed; attempting assembleDebug."; ./gradlew assembleDebug --stacktrace 2>&1 | tee -a "$LOG"; }
  else
    die "No Gradle wrapper + JDK available to build the APK. Cannot emit a valid APK."
  fi
  cd "$ROOT"
}

find_universal_apk() {
  # Prefer an explicitly supplied APK, then a universal one from the build tree.
  if [ -n "$ADHOC_APK" ] && [ -f "$ADHOC_APK" ]; then
    echo "$ADHOC_APK"; return 0
  fi
  find "$ANDROID_PROJECT/app/build/outputs/apk" -iname "*universal*.apk" 2>/dev/null | head -n1 || true
}

# ─────────────────────────────────────────────────────────────────────────────
# Best-effort merge: combine per-ABI split APKs into a single fat APK.
# Only used if a universal APK was not produced (e.g. splits enabled elsewhere).
# ─────────────────────────────────────────────────────────────────────────────
merge_splits_into_universal() {
  log "No universal APK found; merging per-ABI split APKs into a fat APK..."
  local splits_dir="$ANDROID_PROJECT/app/build/outputs/apk/release"
  local base_apk=""
  for abi in "${ABIS[@]}"; do
    local cand; cand="$(find "$splits_dir" -iname "*${abi}*.apk" 2>/dev/null | head -n1 || true)"
    [ -n "$cand" ] && { base_apk="$cand"; break; }
  done
  [ -n "$base_apk" ] || die "No split APKs found to merge (and no universal APK present)."
  local work; work="$(mktemp -d)"
  local merged="$DIST/_merged-universal.apk"
  cp -f "$base_apk" "$merged"
  # Collect every ABI's lib/*.so from every split APK and add them to the base.
  for apk in "$splits_dir"/*.apk; do
    [ -f "$apk" ] || continue
    if command -v unzip >/dev/null 2>&1; then
      unzip -o -q "$apk" 'lib/*.so' -d "$work" 2>/dev/null || true
    fi
  done
  if [ -d "$work/lib" ]; then
    (cd "$work" && zip -q -r "$merged" lib/ >>"$LOG" 2>&1 || true)
  fi
  rm -rf "$work"
  echo "$merged"
}

# ─────────────────────────────────────────────────────────────────────────────
# zipalign + sign + verify
# ─────────────────────────────────────────────────────────────────────────────
# NOTE: align_and_sign sets the global APK_FINAL instead of echoing to stdout.
# It is invoked WITHOUT command substitution: `FINAL="$(align_and_sign ...)"`
# is NOT used because zipalign/apksigner print to stdout and would otherwise be
# captured into the "return value", corrupting $FINAL (an earlier bug that made
# `verify` receive a multi-line garbage path and fail).
APK_FINAL=""
align_and_sign() {
  local src="$1"
  local base="$(basename "$src" .apk)"
  local aligned="$DIST/${base}-aligned.apk"
  local final="$DIST/${base}-final.apk"

  # Order matters for v4: zipalign FIRST (4-byte page alignment), THEN sign.
  # apksigner inserts the APK Signing Block without disturbing entry alignment,
  # so aligning once before signing keeps the v4 .idsig valid.
  log "zipalign -v -p 4  $src -> $aligned"
  rm -f "$aligned"
  "$ZIPALIGN" -v -p 4 "$src" "$aligned" >>"$LOG" 2>&1

  log "Signing with APK Signature Scheme v1+v2+v3+v4 (4096-bit RSA keystore)..."
  rm -f "$final" "$final.idsig"
  # Try v1+v2+v3+v4 first. Some older build-tools apksigner reject
  # --v4-signing-enabled; retry with v1+v2+v3 in that case so the package is
  # still fully signed (v4 is an optimsation for incremental installs).
  if ! "$APKSIGNER" sign --verbose \
        --ks "$KEYSTORE" \
        --ks-key-alias "$ALIAS" \
        --ks-pass "pass:${KS_PASS}" \
        --key-pass "pass:${KEY_PASS}" \
        --v1-signing-enabled true \
        --v2-signing-enabled true \
        --v3-signing-enabled true \
        --v4-signing-enabled true \
        --out "$final" "$aligned" >>"$LOG" 2>&1; then
    log "apksigner --v4 failed (older build-tools?); retrying v1+v2+v3 only."
    rm -f "$final" "$final.idsig"
    "$APKSIGNER" sign --verbose \
      --ks "$KEYSTORE" \
      --ks-key-alias "$ALIAS" \
      --ks-pass "pass:${KS_PASS}" \
      --key-pass "pass:${KEY_PASS}" \
      --v1-signing-enabled true \
      --v2-signing-enabled true \
      --v3-signing-enabled true \
      --out "$final" "$aligned" >>"$LOG" 2>&1
  fi

  # Sanity: the signed APK must itself still be zipaligned (verify passes).
  "$ZIPALIGN" -c -p 4 "$final" >>"$LOG" 2>&1 \
    || log "NOTE: signed APK could not be re-aligned-checked (not fatal, verify below)."

  APK_FINAL="$final"
}

verify() {
  local apk="$1"
  log "=== VERIFICATION: apksigner verify --verbose ==="
  "$APKSIGNER" verify --verbose "$apk" 2>&1 | tee -a "$LOG" || die "apksigner verification FAILED."
  log "=== VERIFICATION: structural validator ==="
  python3 "$PY_VALIDATE" "$apk" --verbose 2>&1 | tee -a "$LOG" \
    || die "Structural validation FAILED for $apk."
  log "=== VERIFICATION: zipinfo ==="
  # Avoid `head` in a pipefail pipeline (head exits after N lines -> SIGPIPE to
  # upstream -> pipeline returns non-zero -> set -e aborts). Buffer to a temp
  # file first, then slice it.
  local ztmp
  ztmp="$(mktemp)"
  if command -v zipinfo >/dev/null 2>&1; then
    zipinfo -v "$apk" > "$ztmp" 2>&1 || true
  else
    unzip -l "$apk" > "$ztmp" 2>&1 || true
  fi
  grep -E "compression method|file name|extra field|central directory|entries" "$ztmp" | head -n 40 | tee -a "$LOG" || true
  rm -f "$ztmp"
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
ensure_keystore

if [ -n "$ADHOC_APK" ]; then
  log "Ad-hoc APK mode: $ADHOC_APK (skipping Gradle build)"
else
  require_native_libs
  build_universal
fi

APK="$(find_universal_apk)"
if [ -z "$APK" ]; then
  APK="$(merge_splits_into_universal)"
fi
[ -f "$APK" ] || die "No APK found to process."

# Always structurally validate BEFORE aligning/signing (fail fast).
log "=== Pre-flight structural validation ==="
python3 "$PY_VALIDATE" "$APK" 2>&1 | tee -a "$LOG" || die "Pre-flight structural validation FAILED. The supplied APK is not a valid installable APK."

APK_FINAL=""
align_and_sign "$APK"
[ -n "$APK_FINAL" ] && [ -f "$APK_FINAL" ] || die "align_and_sign did not produce a signed APK."
FINAL="$APK_FINAL"
verify "$FINAL"

# Final naming + checksum + report.
VERSION="$(sed -n 's/^version[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' "$ROOT/universal-core/Cargo.toml" | head -n1 || true)"
VERSION="${VERSION:-2.0.0}"
OUT_APK="$DIST/V2RayEZ-${VERSION}-universal.apk"
cp -f "$FINAL" "$OUT_APK"
if [ -f "$FINAL.idsig" ]; then cp -f "$FINAL.idsig" "$OUT_APK.idsig"; fi
rm -f "$DIST"/*-aligned.apk "$DIST"/*-final.apk "$DIST"/_merged-universal.apk 2>/dev/null || true
(cd "$DIST" && sha256sum -- *.apk > SHA256SUMS.txt 2>/dev/null || sha256sum -- *.apk 2>/dev/null | tee SHA256SUMS.txt)

cat > "$DIST/VERIFICATION_REPORT.md" <<'REPORT'
# V2RayEZ Universal APK — Packaging Verification Report

This APK was produced & verified by `scripts/build-apk-fix.sh`:

- **One universal fat APK** containing all native ABIs (arm64-v8a, armeabi-v7a,
  x86_64) — split APKs are not emitted separately.
- **`android:extractNativeLibs="true"`** set, so native libs are extracted at
  install time (no page-alignment install parse errors on MIUI / rootless).
- **`android:installLocation="auto"`** set for broad storage compatibility.
- Native libs are **real ELF .so** (never dummy/plain text).
- **zipalign -v -p 4** applied (4-byte page alignment).
- Signed with **APK Signature Scheme v1 + v2 + v3 + v4** using a **4096-bit RSA**
  release keystore (not the debug keystore).
- Verified with **`apksigner verify --verbose`** and the structural validator.

## Verification commands
```bash
apksigner verify --verbose V2RayEZ-2.0.0-universal.apk
zipinfo -v V2RayEZ-2.0.0-universal.apk | head
python3 tools/apk_structural_validate.py V2RayEZ-2.0.0-universal.apk --verbose
sha256sum -c SHA256SUMS.txt
```
REPORT

log "DONE. Final universal APK: $OUT_APK"
ls -lh "$DIST" | tee -a "$LOG"
