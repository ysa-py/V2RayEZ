# Android Build - APK (not raw .a)

This directory now produces **installable APKs** with multi-ABI support, not just `libv2rayez_universal_core.a`.

## Outputs

- `V2RayEZ-<version>-universal.apk` - **single universal fat APK** containing all
  ABIs (`arm64-v8a`, `armeabi-v7a`, `x86_64`). No per-ABI split APKs are emitted;
  a single cohesive standalone APK avoids MIUI/rootless split-install problems.

All APKs are built via Gradle + NDK r26c, then **zipaligned (`zipalign -v -p 4`)**,
signed with **APK Signature Scheme v1 + v2 + v3 + v4** using a **4096-bit RSA**
release keystore, and verified with `apksigner verify --verbose` and
`tools/apk_structural_validate.py`. See `scripts/build-apk-fix.sh`.

## Architecture Mapping

| Rust Target | Android ABI | Notes |
|-------------|-------------|-------|
| `aarch64-linux-android` | `arm64-v8a` | Primary |
| `armv7-linux-androideabi` | `armeabi-v7a` | Legacy |
| `x86_64-linux-android` | `x86_64` | Emulator |

## Build Pipeline (GitHub Actions)

Job `build-android` in `release.yml` runs on `ubuntu-latest`:

1. Setup Java 17, Android SDK, NDK r26c (cached)
2. Download core libs (`aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`) built with optimized flags (`opt-level=3`, `lto=true`, `strip=true`)
3. Build JNI shared libs:
   ```bash
   $NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android24-clang \
     -shared -fPIC -O3 -flto \
     -I universal-core/android/jni \
     universal-core/android/jni/v2rayez_core_jni.c \
     libv2rayez_universal_core.a -llog \
     -o app/src/main/jniLibs/arm64-v8a/libv2rayez_core.so
   ```
   (Repeated for each ABI)
4. Automated build + structural fix + align + sign (single universal APK):
   ```bash
   bash scripts/build-apk-fix.sh --out dist-android-final
   ```
   This builds the universal fat APK, validates the binary AXML manifest + real
   ELF `.so` (rejects dummy libs), runs `zipalign -v -p 4`, generates a 4096-bit
   RSA release keystore, signs with v1+v2+v3+v4, and verifies.
5. Output: `dist-android-final/V2RayEZ-<version>-universal.apk` + `SHA256SUMS.txt`
   + `VERIFICATION_REPORT.md`.

## JNI Layer

- `jni/v2rayez_core.h` - FFI header
- `jni/v2rayez_core_jni.c` - JNI bridge that calls `v2rayez_core_init`, `v2rayez_core_start`, etc., and frees strings via `v2rayez_free_string`
- `src/com/v2rayez/core/NativeBridge.java` - Java wrapper loading `libv2rayez_core.so`
- `src/com/v2rayez/core/CoreStateViewModel.kt` - Kotlin ViewModel binding FFI to LiveData

## Local Build

```bash
# Build core libs first
./universal-core/ci/build-target.sh aarch64-linux-android "std,post-quantum-lab"
./universal-core/ci/build-target.sh armv7-linux-androideabi "std,post-quantum-lab"
./universal-core/ci/build-target.sh x86_64-linux-android "std,post-quantum-lab"

# Build APK
bash scripts/build-android-apk.sh
ls dist-android/*.apk
```

## Verification

```bash
# Signature (must list v1, v2, v3, v4 as verified)
apksigner verify --verbose V2RayEZ-2.0.0-universal.apk
# Structure (binary manifest, real ELF .so for all ABIs, classes.dex present)
python3 tools/apk_structural_validate.py V2RayEZ-2.0.0-universal.apk --verbose
# Alignment
zipalign -c -v -p 4 V2RayEZ-2.0.0-universal.apk
# Checksums
sha256sum -c SHA256SUMS.txt
# Install
adb install V2RayEZ-2.0.0-universal.apk
```

## Preserved Features

- All existing cross-compilation targets kept
- Optimized flags: `opt-level=3`, `lto=true`, `codegen-units=1`, `strip=true`, `panic=abort`
- FFI symbols: `v2rayez_core_init`, `v2rayez_free_string`, etc., verified in CI
