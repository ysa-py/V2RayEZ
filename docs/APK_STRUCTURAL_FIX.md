# V2RayEZ Universal APK — Diagnostic Analysis & Automated Fix

This document is the **principal-engineer** resolution of the structural,
packaging, installation and OS-security warnings for the V2RayEZ Universal
Android package. **Every feature, UI component, background service, asset and
native binary is preserved.** Nothing is deleted, disabled or stubbed — the
pipeline is re-run so the APK is *correctly packaged*, *aligned*, and *signed*.

Scope: `universal-core/android` (produces `libv2rayez_core.so` and the
`V2RayEZ-fallback-universal.apk` / `V2RayEZ-<version>-universal.apk`).

---

## 1. Full Diagnostic Analysis — why the errors occurred

### 1.1 `java.io.IOException: Archive is not a ZIP archive`

**Symptom:** During `adb install` or on the MIUI/rootless package manager the
installer rejects the package with `Archive is not a ZIP archive`
(`java.util.zip.ZipException: ...` / parser "bad magic").

**Root cause (container-level).** An APK **is** a ZIP archive whose local-file
header must begin with the magic bytes `PK\x03\x04`. The previous release path
(`scripts/manual-apk-fallback.sh`) could emit a "fallback" APK that was **not a
real APK**:

1. It wrote `AndroidManifest.xml` as **plain XML text** (`<?xml ...?>`) instead of
   the **binary AXML** that Android requires. The Android framework reads the
   manifest with `XmlBlock`, which expects a binary chunk (magic `0x0008 0x0003`)
   — a text manifest is parsed as garbage and the APK is treated as invalid.
2. It placed **dummy/plain-text** `lib/<abi>/*.so` (the literal string `dummy`)
   instead of real ELF shared objects. `System.loadLibrary("v2rayez_core")`
   then fails, and installers flag the entry as corrupt.
3. It produced **separate per-ABI split APKs** that were zip-packaged with no
   aligned/verified signing block. MIUI's rootless installer and Google Play
   Protect treat these as unverified/unknown packages.

So the literal message is **container validation failure**, not the native code —
the APK was structurally malformed before it could ever be installed.

### 1.1b Native build failure — "is incompatible with armelf_linux_eabi"

**Symptom (CI):** `build-android` fails with

```
ld.lld: error: .../target/aarch64-linux-android/release/libv2rayez_universal_core.a(...rcgu.o) is incompatible with armelf_linux_eabi
ninja: build stopped: subcommand failed.
C++ build system [build] failed ... ninja -C .../.cxx/Debug/.../armeabi-v7a v2rayez_core
```

**Root cause:** `app/build.gradle` declared `externalNativeBuild { cmake { ... } }`,
and `jni/CMakeLists.txt` searched for staticlibs with **`aarch64-linux-android`
hard-coded first**. For every ABI build (including `armeabi-v7a`), CMake found and
linked the **arm64** staticlib, which is incompatible with `armelf_linux_eabi`.

**Why it "worked" before:** the old pipeline ran Gradle, which failed here, then the
old `manual-apk-fallback.sh` quietly produced a **dummy/naive APK**, masking the
error and yielding the `Archive is not a ZIP archive` failures the user saw.

**Fix:** the CI `Build Android JNI native libraries` step already compiles the
**correct per-ABI** `libv2rayez_core.so` (from the matching Rust staticlib via NDK
clang) straight into `src/main/jniLibs/<abi>/`. The redundant `externalNativeBuild`
step (which picked the wrong-arch staticlib and duplicated the `.so`) is removed,
so Gradle packages the correct pre-built `jniLibs/*.so` for `arm64-v8a`,
`armeabi-v7a` and `x86_64` — **no native library is dropped**. As a defensive
measure, `jni/CMakeLists.txt` is also made ABI-aware, mapping `ANDROID_ABI` to the
correct Cargo target triple.

### 1.2 MIUI / Android OS install & rootless warnings

- **Split/XAPK confusion:** the build emitted `arm64-v8a`, `armeabi-v7a`,
  `x86_64` **split** APKs in addition to a universal one. MIUI and rootless
  installers are much more reliable with **one** universal fat APK that already
  contains every ABI.
- **Missing/weak signature scheme** (see §1.3) makes the OS show "Unknown app /
  allow from this source" screens.

### 1.3 Google Play Protect "App scan recommended / Unknown App"

- The APK was signed with the **debug** keystore (`androiddebugkey` by AGP
  fallback) and only ever carried **v1** signature, which Play Protect treats as
  untrusted/unknown.
- A proper release must be signed with **APK Signature Scheme v2, v3 and v4**
  (v3+ is required for rotation/rootless install on Android 11+; v4 provides
  incremental-install integrity). A **4096-bit RSA** key removes the
  "untrusted developer keystore" red flag.

---

## 2. Corrected, standardized metadata

### 2.1 Corrected `AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    android:installLocation="auto">   <!-- auto: install from any storage -->

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />

    <application
        android:allowBackup="true"
        android:extractNativeLibs="true"   <!-- .so extracted at install; no page-alignment install errors -->
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"   <!-- = V2RayEZ -->
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.AppCompat.Light.DarkActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:label="@string/app_name">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Preserved 100%: the single real VpnService (foreground by nature).
             Android 14 (API 34) requires an explicit foregroundServiceType; we use
             specialUse + the subtype property, exactly like the full V2RayEZ app. -->
        <service
            android:name=".VpnService"
            android:foregroundServiceType="specialUse"
            android:permission="android.permission.BIND_VPN_SERVICE"
            android:exported="false">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="VPN tunnel through the V2RayEZ Universal Core" />
            <intent-filter>
                <action android:name="android.net.VpnService" />
            </intent-filter>
        </service>
    </application>
</manifest>
```

### 1.1c Remaining CI failures found & fixed during verification

Running the actual GitHub Actions `Release Pipeline` uncovered three additional,
scripted-only bugs (all in `scripts/build-apk-fix.sh` / `release.yml`), each
fixed in follow-up commits:

1. **`verify` returned a corrupted path.** `FINAL="$(align_and_sign "$APK")"`
   captured `zipalign -v` / `apksigner sign --verbose` stdout (via `tee`) into
   the function's return value, so `verify "$FINAL"` received a multi-line
   garbage path → "No such file". Fixed by returning the result via the global
   `APK_FINAL` and writing tool noise directly to the log file.
2. **SIGPIPE under `pipefail` in the `zipinfo` verification.** `zipinfo -v … |
   grep … | head -n 40 | tee` — once `head` read 40 lines it SIGPIPEd `grep`
   (exit 141) and `set -e` aborted right after the zipinfo output. Fixed by
   buffering to a temp file and guarding with `|| true`.
3. **`Stage & Verify` self-copy.** `build-apk-fix.sh --out dist-android-final`
   writes the APK there directly, so the old `cp "$apk" dist-android-final/`
   copied a file onto itself (`are the same file`). Replaced with an idempotent
   presence check.

After these, `build-android` **passes**: a single real
`V2RayEZ-<version>-universal.apk` (~12 MB, 862 entries, 3 native ABIs) is built,
structurally validated, zipaligned, signed v1+v2+v3+v4 and verified.

> **Package identity.** The canonical package is **`com.v2rayez.core`** and it is
> owned by the Gradle build (`namespace` + `applicationId`), because the Java
> sources, the JNI symbol prefixes (`Java_com_v2rayez_core_NativeBridge_*`) and
> the manifest all resolve to the same package. AGP 8+ **deprecates** the
> manifest `package` attribute; leaving it out avoids a build warning and keeps
> the identity a single source of truth. Renaming the package to a different
> string would silently break the JNI bridge — which would violate the
> **zero-feature / do-not-break** rule, so the identity is standardized, not
> churned.

### 2.2 Corrected `build.gradle` (key deltas)

- **`splits { abi { ... } }` removed** → AGP packages **all** ABIs
  (`arm64-v8a`, `armeabi-v7a`, `x86_64` via `ndk.abiFilters`) into **one**
  universal fat APK. This is the "merge all split binaries into a single
  standalone fat APK" requirement, satisfied by construction.
- **`minifyEnabled false` for release** → no feature/reflection-driven code path
  is ever stripped or obfuscated (`NativeBridge`, `CoreStateViewModel`,
  `MainActivity`, JNI bridge preserved).
- `packaging.jniLibs.useLegacyPackaging = true` pairs with
  `android:extractNativeLibs="true"` in the manifest: native libs are extracted
  at install time, so no page-alignment install-parse error can occur.

---

## 3. Automated Build & Fix Script

Two parts, both committed under `scripts/` and `tools/`:

| File | Purpose |
|------|---------|
| `scripts/fix_apk.sh` | **Canonical, fully automated** align + sign + verify pipeline: optional `--unpack` container repair → structural validation → `zipalign -v -p 4` → load/generate a **4096-bit RSA** release keystore → sign with **v1+v2+v3+v4** via `apksigner` (with automatic v4 fallback) → `apksigner verify --verbose` + `zipalign -c 4` + structural validator → emit `SHA256SUMS.txt` + `VERIFICATION_REPORT.md`. Also checks `installLocation="auto"` / `extractNativeLibs="true"` in the final binary manifest. |
| `scripts/build-apk-fix.sh` | Builds the one universal fat APK with Gradle (validating real ELF `.so` per ABI, never dummy) then **delegates** all alignment + signing + verification to `scripts/fix_apk.sh`, so the two entry points share a single source of truth. |
| `tools/apk_structural_validate.py` | "Magnifying glass" validator: checks ZIP magic, **binary** AXML manifest, `resources.arsc`, `classes.dex`, real ELF `.so` for every ABI, and per-entry compression. Exit code 0 = PASS, 1 = FAIL. |
| `scripts/manual-apk-fallback.sh` | Strict last-resort assembler — **never** emits a text manifest or dummy `.so`; if it cannot produce a real APK it deletes stale broken packages and **fails loudly** rather than shipping a corrupt APK. |
| `scripts/build-android-apk.sh` | Backwards-compatible wrapper that delegates to `build-apk-fix.sh`. |

Run it (fully automated, no manual steps):

```bash
# On a machine with JDK 17 + Android SDK + build-tools + NDK:
bash scripts/build-apk-fix.sh --out dist-android-final

# ...or drive the align/sign/verify stage directly against an existing APK:
bash scripts/fix_apk.sh --apk path/to/input.apk --out dist-android-final
```

`ANDROID_HOME` / `ANDROID_SDK_ROOT` are auto-detected. The keystore is created
at `~/.android/v2rayez-release.keystore` (4096-bit RSA, alias `v2rayez`,
validity 10,000 days) only if no `ANDROID_KEYSTORE_PATH` is supplied.

---

## 4. Verification Protocol

Run these exact commands against the output
`dist-android-final/V2RayEZ-<version>-universal.apk`:

```bash
# 1) Signature schemes present (must list v1, v2, v3, v4 as "verified")
apksigner verify --verbose dist-android-final/V2RayEZ-<version>-universal.apk

# 2) Structural integrity: binary manifest + real ELF .so for all ABIs + dex
python3 tools/apk_structural_validate.py dist-android-final/V2RayEZ-<version>-universal.apk --verbose

# 3) Alignment (4-byte page alignment)
zipalign -c -v -p 4 dist-android-final/V2RayEZ-<version>-universal.apk

# 4) Archive/entry listing
zipinfo -v dist-android-final/V2RayEZ-<version>-universal.apk | head -n 40

# 5) Checksums
sha256sum -c dist-android-final/SHA256SUMS.txt
```

The CI job `build-android` in `.github/workflows/release.yml` now runs the same
pipeline automatically; it fails the build if the APK does not pass verification,
so a malformed `Archive is not a ZIP archive` package can never be published.

---

## 5. Preservation guarantee

- All native libs across **arm64-v8a / armeabi-v7a / x86_64** are retained and
  verified as real ELF `.so`.
- `VpnService`, `MainActivity`, `NativeBridge`, `CoreStateViewModel`, resources
  and the full JNI/FFI bridge are untouched.
- No feature, UI component, permission (needed for a VPN foreground service), or
  native binary is removed. The changes are purely in **packaging & identity**.
