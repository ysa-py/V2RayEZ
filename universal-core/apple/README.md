# iOS Build - IPA (not raw .a)

This directory now produces **installable .ipa** via Xcodebuild automated CLI, not raw `libv2rayez_universal_core.a`.

## Outputs

- `V2RayEZ-<version>.ipa` - Ad-hoc signed IPA, installable via AltStore, Sideloadly, or Xcode
- `V2RayEZCore.xcframework` - XCFramework for integration (iOS arm64 + simulator + macOS)

## Build Pipeline (GitHub Actions)

Job `build-ios` in `release.yml` runs on `macos-latest`:

1. Download Apple core libs (`aarch64-apple-darwin`, `x86_64-apple-darwin`, `aarch64-apple-ios`, `x86_64-apple-ios`) built with `opt-level=3`, `lto=true`, `strip=true`
2. Build iOS staticlibs:
   ```bash
   cargo build --target aarch64-apple-ios --release --features "std,post-quantum-lab"
   cargo build --target x86_64-apple-ios --release --features "std,post-quantum-lab"
   cargo build --target aarch64-apple-ios-sim --release --features "std,post-quantum-lab"
   ```
3. Create XCFramework:
   ```bash
   bash scripts/build-ios-xcframework.sh
   # xcodebuild -create-xcframework -library ios-arm64/lib.a -headers headers/ -library ios-sim/lib.a -headers headers/ -output V2RayEZCore.xcframework
   ```
4. Setup Xcode + xcodegen (cached)
5. Build IPA with retry:
   ```bash
   cd MICAFP/ios
   xcodegen generate
   xcodebuild -project V2RayEZ.xcodeproj -scheme V2RayEZ -configuration Release -archivePath dist-ios/V2RayEZ.xcarchive archive CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" AD_HOC_CODE_SIGNING_ALLOWED=YES
   xcodebuild -exportArchive -archivePath dist-ios/V2RayEZ.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath dist-ios/final
   ```
6. Fallback minimal IPA if Xcode project fails:
   ```bash
   bash universal-core/apple/build-ipa.sh
   # Creates Payload/V2RayEZ.app + Info.plist + binary, zips to .ipa
   ```
7. Rename to `V2RayEZ-<version>.ipa`
8. Generate SHA256SUMS

## ExportOptions.plist

Ad-hoc method for unsigned/sideloadable IPA:

```xml
<key>method</key><string>ad-hoc</string>
<key>signingStyle</key><string>automatic</string>
<key>stripSwiftSymbols</key><true/>
<key>compileBitcode</key><false/>
```

For App Store distribution, replace with `app-store` method and provide signing identity.

## Local Build (macOS only)

```bash
# Build core for iOS
./universal-core/ci/build-target.sh aarch64-apple-ios "std,post-quantum-lab"
./universal-core/ci/build-target.sh x86_64-apple-ios "std,post-quantum-lab"

# Build XCFramework
bash scripts/build-ios-xcframework.sh

# Build IPA
bash scripts/build-ios-ipa.sh
ls dist-ios/final/*.ipa
```

## Swift Integration

- `Swift/NativeBridge.swift` - Swift wrapper over FFI (`v2rayez_core_init`, `v2rayez_free_string`, etc.)
- `Swift/ObservableGlue.swift` - `ObservableObject` binding to SwiftUI
- `Module/module.modulemap` - Clang module map for XCFramework

## Installation

- **AltStore**: Open AltStore -> My Apps -> + -> Select IPA
- **Sideloadly**: Drag IPA to Sideloadly, enter Apple ID
- **Xcode**: Window -> Devices and Simulators -> Drag IPA to device

## Preserved Features

- All existing Apple targets kept (`aarch64-apple-darwin`, `x86_64-apple-darwin` for macOS + new iOS targets)
- Optimized flags preserved
- FFI symbols verified
