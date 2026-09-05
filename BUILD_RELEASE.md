# Vor Universal Release Pipeline - Refactored

> Brand note 2026-09-04: the shipping product name is **Vor**; `V2RayEZ` is the
> legacy/internal project name and remains in internal identifiers/donor code.

## Problem Fixed

**Before**: CI produced raw static/dynamic C libraries:
- Android: `.a` static libs instead of `.apk`
- Windows: `.dll` instead of `.exe`
- iOS: `.a` instead of `.ipa`
- OpenWrt: binary archives instead of LuCI `.ipk`

**After**: Fully automated pipeline producing installable end-user packages:

- Android: Gradle/NDK -> `.apk` (arm64-v8a, armeabi-v7a, x86_64, universal)
- Windows: Tauri + cargo -> `.exe` + NSIS `-setup.exe` + MSI
- iOS: Xcodebuild -> `.ipa` (ad-hoc unsigned, sideloadable)
- OpenWrt: SDK + Makefile -> LuCI `.ipk` (mipsel_24kc, aarch64_cortex-a53, x86_64)
- Plus SHA256SUMS.txt auto-generated

## Workflow File

`.github/workflows/release.yml` - Production-ready, no placeholders.

### Triggers

- Push to `main` or `arena/*` branches
- Tags `v*`
- Pull requests (build only, no publish)
- Manual dispatch with optional custom tag and OpenWrt SDK skip flag

### Jobs Overview

```
meta -> build-core (matrix 13 targets) -> [build-android, build-windows, build-ios, build-openwrt] -> publish-release
                                      \-> verify-symbols
```

#### 1. meta

- Reads version from `universal-core/Cargo.toml`
- Determines tag: custom input > git tag > `v2rayez-universal-latest`
- Outputs `version`, `tag`, `title`, `prerelease`, `short_sha`

#### 2. build-core

Matrix preserves **every existing target** + adds new iOS and OpenWrt musl targets:

| Target | OS Runner | Platform | Artifact |
|--------|-----------|----------|----------|
| x86_64-unknown-linux-gnu | ubuntu | Linux | .a + binary |
| aarch64-unknown-linux-gnu | ubuntu | Linux | .a |
| mipsel-unknown-linux-musl | ubuntu | OpenWrt | .a |
| aarch64-apple-darwin | macos | Apple | .a |
| x86_64-apple-darwin | macos | Apple | .a |
| x86_64-pc-windows-msvc | windows | Windows | .dll + .exe |
| aarch64-linux-android | ubuntu | Android | .a |
| armv7-linux-androideabi | ubuntu | Android | .a |
| x86_64-linux-android | ubuntu | Android | .a |
| aarch64-apple-ios | macos | iOS | .a |
| x86_64-apple-ios | macos | iOS | .a |
| aarch64-unknown-linux-musl | ubuntu | OpenWrt | .a |
| x86_64-unknown-linux-musl | ubuntu | OpenWrt | .a |

Features:

- **Caching**: `~/.cargo/registry`, `~/.cargo/git`, `target/`, Gradle, npm, OpenWrt SDK, NDK
- **Retry**: `nick-fields/retry@v3` with 3 attempts, exponential backoff
- **Logging**: `tee build-*.log`, upload logs on failure
- **Optimized flags preserved**: `opt-level=3` (or `s`/`z`), `lto=true`, `codegen-units=1`, `strip=true`, `panic=abort`

Uses `universal-core/ci/build-target.sh` which handles:

- Linux cross linkers (`gcc-aarch64-linux-gnu`, `gcc-mipsel-linux-gnu`)
- Android NDK clang linkers (`aarch64-linux-android24-clang`, etc.)
- Apple requires macOS runner (fail fast on Linux)
- Windows uses `cargo-xwin` on non-Windows runners

#### 3. build-android

- Runner: `ubuntu-latest`
- Needs: `build-core`
- Steps:
  - Download Android core libs
  - Setup Java 17, Android SDK, NDK r26c
  - Cache Gradle
  - Build `.so` from `.a` + `jni/v2rayez_core_jni.c` via NDK clang per ABI (with `-O3 -flto`)
  - Gradle build with retry: `./gradlew assembleDebug` + `assembleRelease`
  - Fallback manual APK via `scripts/manual-apk-fallback.sh` if Gradle fails
  - Rename to `V2RayEZ-<version>-<abi>.apk`
  - Upload artifact `android-apk-<version>`

#### 4. build-windows

- Runner: `windows-latest`
- Needs: `build-core`
- Steps:
  - Download Windows core lib
  - Setup Rust + cargo cache + Node 20 + npm cache
  - Install NSIS + WiX via choco
  - Build `v2rayez-license-gate.exe` via cargo (retry 3x)
  - Build Tauri GUI: `npm ci`, `prepare-sidecar.mjs`, `tauri build --bundles nsis,msi` (retry 2x)
  - Custom NSIS installer via `build-windows.ps1` (`makensis installer.nsi`)
  - Rename to `V2RayEZ-<version>.exe`, `V2RayEZ-<version>-setup.exe`, `V2RayEZ-<version>.msi`
  - Upload `windows-exe-<version>`

#### 5. build-ios

- Runner: `macos-latest`
- Needs: `build-core`
- Steps:
  - Download Apple/iOS core libs
  - Setup Rust with iOS targets
  - Build staticlibs for `aarch64-apple-ios`, `x86_64-apple-ios`, `aarch64-apple-ios-sim` (retry 3x)
  - Create XCFramework via `scripts/build-ios-xcframework.sh` (lipo + `xcodebuild -create-xcframework`)
  - Setup Xcode + xcodegen
  - Build IPA: `xcodegen generate`, `xcodebuild archive` with `CODE_SIGNING_ALLOWED=NO`, `xcodebuild -exportArchive` with `ExportOptions.plist` (ad-hoc) (retry 2x)
  - Fallback minimal IPA via `scripts/build-ios-ipa.sh` (Payload/V2RayEZ.app + zip)
  - Rename to `V2RayEZ-<version>.ipa`
  - Upload `ios-ipa-<version>`

#### 6. build-openwrt

- Runner: `ubuntu-latest`
- Strategy matrix: `mipsel_24kc`, `aarch64_cortex-a53`, `x86_64`
- Needs: `build-core`
- Steps:
  - Download OpenWrt core libs
  - Cache OpenWrt SDK per target
  - Install build deps
  - Build IPK via `scripts/build-openwrt-ipk.sh`:
    - Download SDK from `downloads.openwrt.org` (cached)
    - `make package/unifiedshield/compile V=s`
    - Fallback to manual IPK via `universal-core/openwrt/build-ipk.sh` (ar archive: debian-binary + control.tar.gz + data.tar.gz)
  - Rename to `unifiedshield_<version>-1_<arch>.ipk` + `luci-app-unifiedshield_*.ipk`
  - Upload `openwrt-ipk-<target>-<version>`

#### 7. publish-release

- Runner: `ubuntu-latest`
- Needs all builds, skipped on PR
- Concurrency group to avoid duplicate rolling releases
- Steps:
  - Download all final artifacts (`android-apk-*`, `windows-exe-*`, `ios-ipa-*`, `openwrt-ipk-*`)
  - Verify required types exist (apk, exe, ipa, ipk) - fail closed if missing
  - Generate `SHA256SUMS.txt` + per-type `SHA256SUMS-*.txt`
  - Generate release notes with asset table, install instructions, pipeline features
  - Publish via `gh` CLI:
    - If tag exists: refresh (edit title/notes, purge stale assets, upload with --clobber)
    - Else: `gh release create <tag> <assets> --title <title> --notes-file <notes> [--prerelease]`
  - Idempotent, automatic, zero manual steps

#### 8. verify-symbols

- Checks FFI exports (`v2rayez_core_init`, `v2rayez_free_string`, `v2rayez_core_status`, `v2rayez_core_start`) present in all `.a`, `.so`, `.dll`, `.dylib` artifacts via Python binary search

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/build-android-apk.sh` | Gradle APK build with retry + logging |
| `scripts/manual-apk-fallback.sh` | Manual APK creation via aapt/aapt2 or zip fallback |
| `scripts/build-ios-xcframework.sh` | XCFramework from staticlibs (lipo + xcodebuild) |
| `scripts/build-ios-ipa.sh` | IPA via xcodebuild archive + export + fallback |
| `scripts/build-openwrt-ipk.sh` | OpenWrt SDK build + fallback to manual IPK |
| `scripts/manual-ipk-fallback.sh` | Manual IPK via ar (debian-binary, control.tar.gz, data.tar.gz) |
| `scripts/generate-checksums.sh` | SHA256SUMS.txt for all final assets |
| `universal-core/ci/build-target.sh` | Cross-compilation helper preserving all targets + optimized flags |
| `universal-core/android/jni/CMakeLists.txt` | CMake for JNI .so from staticlib |
| `universal-core/apple/build-xcframework.sh` | XCFramework creation |
| `universal-core/apple/build-ipa.sh` | IPA creation |
| `universal-core/openwrt/build-ipk.sh` | Manual LuCI IPK packaging |
| `universal-core/windows/build-windows.sh` | Windows exe + Tauri build (bash) |
| `universal-core/windows/build-windows.ps1` | Windows exe + NSIS installer (PowerShell) |
| `universal-core/windows/installer.nsi` | NSIS installer script |

## Android Details

- **Gradle project**: `universal-core/android/` - minimal app with `MainActivity.kt`, `VpnService.kt`, `NativeBridge.java`, `CoreStateViewModel.java`
- **JNI**: `android/jni/v2rayez_core_jni.c` bridges Java to Rust FFI
- **Native libs**: built per-ABI by the CI `Build Android JNI native libraries`
  step (NDK clang linking the matching Rust staticlib with `-O3 -flto`) into
  `app/src/main/jniLibs/<abi>/libv2rayez_core.so`. `app/build.gradle` packages
  these directly (the redundant `externalNativeBuild`/CMake step that linked the
  wrong-arch staticlib for `armeabi-v7a` is removed).
- **Single universal fat APK**: ABI splitting is disabled; `ndk.abiFilters` keeps
  `arm64-v8a`, `armeabi-v7a`, `x86_64` so ONE standalone `V2RayEZ-<version>-universal.apk`
  is produced (no separate split APKs to confuse MIUI/rootless installers).
- **Structural validation**: `tools/apk_structural_validate.py` rejects any APK
  with a plain-text manifest, missing `classes.dex`/`resources.arsc`, or dummy
  (non-ELF) `.so` — the direct cause of `java.io.IOException: Archive is not a ZIP
  archive`.
- **Alignment + signing**: `scripts/build-apk-fix.sh` runs `zipalign -v -p 4`,
  generates a 4096-bit RSA release keystore and signs with APK Signature Scheme
  **v1 + v2 + v3 + v4** via `apksigner`, then verifies with `apksigner verify
  --verbose`. Signing env: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (auto-generated keystore otherwise).

## Windows Details

- **Binary**: `v2rayez-license-gate.exe` from `cargo build --bin v2rayez-license-gate`
- **GUI**: `V2RayEZ-GUI` Tauri app (`src-tauri/Cargo.toml` depends on `v2rayez-universal-core`)
- **Bundles**: `nsis`, `msi` via `tauri.conf.json`
- **Custom NSIS**: `installer.nsi` creates Start Menu + Desktop shortcuts, uninstaller, registry entry
- **Preserved**: `v2rayez_universal_core.dll` for C# / C++ consumers

## iOS Details

- **Targets**: `aarch64-apple-ios` (device), `x86_64-apple-ios` + `aarch64-apple-ios-sim` (simulator)
- **XCFramework**: `V2RayEZCore.xcframework` containing device + simulator slices + headers
- **Xcode project**: `MICAFP/ios/project.yml` (xcodegen) or fallback minimal app
- **Export**: `ExportOptions.plist` method `ad-hoc`, signingStyle `automatic`, for sideloading
- **Fallback**: Manual `Payload/V2RayEZ.app` + `Info.plist` + zip to `.ipa`

## OpenWrt Details

- **SDK**: Downloaded from `downloads.openwrt.org/releases/23.05.5/targets/<target>/openwrt-sdk-*.tar.xz`, cached
- **Package**: `unifiedshield` + `luci-app-unifiedshield`
- **Manual IPK**: `ar` format with `debian-binary` (2.0), `control.tar.gz` (control, postinst, prerm), `data.tar.gz` (bin, config, init, LuCI files)
- **LuCI**: Controller, CBI model, ACL, status view
- **Init**: procd `START=99`, respawn, calls `v2rayez-license-gate --mode enforce ... --allow-offline-grace`

## SHA256SUMS

Auto-generated in `publish-release`:

```bash
(cd release-assets && sha256sum -- * > SHA256SUMS.txt)
```

Also per-type:

- `SHA256SUMS-APK.txt`
- `SHA256SUMS-IPA.txt`
- `SHA256SUMS-EXE.txt`
- `SHA256SUMS-IPK.txt`

Verification:

```bash
sha256sum -c SHA256SUMS.txt
```

## Caching

- **Cargo**: `~/.cargo/registry`, `~/.cargo/git`, `target/`, `~/.cargo/bin`
- **Gradle**: `~/.gradle/caches`, `~/.gradle/wrapper`, `.gradle`
- **npm**: `~/.npm`, `V2RayEZ-GUI/node_modules` via `actions/setup-node` cache
- **OpenWrt SDK**: `openwrt-sdk/`, `/tmp/openwrt-sdk` per target
- **NDK**: Cached via `nttld/setup-ndk` + `actions/cache`

## Retry

- **Cargo**: 3 attempts, 30-60s wait, exponential backoff via `nick-fields/retry@v3`
- **Gradle**: 2-3 attempts, 60s wait
- **Xcode**: 2 attempts, 60s wait
- **SDK**: 2-3 attempts, 10-60s wait
- **Bash fallback**: Custom `retry()` function with `max=3`, `delay*=2`

## Error Logging

- `set -euo pipefail` + `set -x` where appropriate
- `tee build-*.log` for each target
- Upload logs on failure via `actions/upload-artifact`
- `find ... -type f | head -n 100` + `cat log | tail -n 200` on failure
- Detailed `ls -lh` of artifacts after each step

## Feature Parity

- **No target dropped**: All original targets preserved + new iOS and musl targets added
- **Optimized flags**: `opt-level=3`/`s`/`z`, `lto=true`, `codegen-units=1`, `strip=true`, `panic=abort` from `Cargo.toml`
- **FFI**: `v2rayez_core_init`, `v2rayez_core_shutdown`, `v2rayez_core_status`, `v2rayez_core_start`, `v2rayez_core_stop`, `v2rayez_license_verify`, `v2rayez_free_string` verified
- **License gating**: `v2rayez-license-gate` binary preserved for all platforms
- **AI Provider Gateway**: Preserved via `ai_provider.rs`
- **Route matrix**: Preserved via `route_matrix.rs`

## Local Testing

```bash
# Core libs
./universal-core/ci/build-target.sh x86_64-unknown-linux-gnu "std,post-quantum-lab"
./universal-core/ci/build-target.sh aarch64-linux-android "std,post-quantum-lab"

# Android APK
bash scripts/build-android-apk.sh

# Windows EXE (on Windows or with cargo-xwin)
bash universal-core/windows/build-windows.sh
# or PowerShell
pwsh universal-core/windows/build-windows.ps1

# iOS IPA (macOS only)
bash scripts/build-ios-xcframework.sh
bash scripts/build-ios-ipa.sh

# OpenWrt IPK
bash universal-core/openwrt/build-ipk.sh --arch mipsel_24kc --out-dir dist-openwrt --version 2.0.0

# Checksums
bash scripts/generate-checksums.sh release-assets
```

## Release Publishing

- **Stable**: Tag push `v*` -> release at exact tag, `prerelease=false`
- **Rolling**: Branch push / dispatch -> `v2rayez-universal-latest`, `prerelease=true`, refreshed in place, stale assets purged
- **Idempotent**: Concurrent runs serialized via `concurrency.group`, queued run takes refresh path
- **Automatic**: No manual steps, `GITHUB_TOKEN` with `contents: write`

## Verification

```bash
# After download
sha256sum -c SHA256SUMS.txt
# Check FFI symbols
python3 -c "
import os
for root,_,files in os.walk('release-assets'):
  for f in files:
    if f.endswith(('.a','.so','.dll')):
      data=open(os.path.join(root,f),'rb').read()
      assert b'verayez_core_init' in data
print('FFI OK')
"
```
