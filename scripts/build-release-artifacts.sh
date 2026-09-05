#!/usr/bin/env bash
# V2RayEZ Universal release artifact orchestrator.
#
# This wrapper coordinates the real platform build commands for required output
# formats. It intentionally fails when a platform toolchain/signing environment is
# missing; it never creates placeholder APK/IPA/EXE/IPK files.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_ANDROID_DIR="$REPO_ROOT/V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)"
GUI_DIR="$REPO_ROOT/V2RayEZ-GUI"
IOS_DIR="$REPO_ROOT/MICAFP/ios"
OPENWRT_PACKAGE_SCRIPT="$REPO_ROOT/MICAFP/scripts/package-openwrt.sh"
ARTIFACT_DIR="${ARTIFACT_DIR:-$REPO_ROOT/artifacts/release}"
VERSION="${VERSION:-2.0.0}"
TARGETS=(all)
CHECK_ONLY=0

usage() {
    cat <<USAGE
Usage: $0 [--target all|android|ios|windows|linux|openwrt|dashboard|extensions] [--artifacts DIR] [--check]

Environment:
  ARTIFACT_DIR                 Output root for copied artifacts (default: artifacts/release)
  VERSION                      Release version label (default: 2.0.0)
  OPENWRT_SDK                  Required for --target openwrt builds
  V2RAYEZ_WINDOWS_BUILDER=1    Required to request Windows .exe build from non-Windows hosts

The script runs real build tools and then copies artifacts. Missing toolchains or
missing expected outputs are fatal so release evidence cannot be faked.
USAGE
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --target)
            IFS=',' read -r -a TARGETS <<< "${2:-}"
            shift 2
            ;;
        --artifacts|--out-dir)
            ARTIFACT_DIR="${2:-}"
            shift 2
            ;;
        --check)
            CHECK_ONLY=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "error: unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

command_exists() { command -v "$1" >/dev/null 2>&1; }

require_tool() {
    command_exists "$1" || {
        echo "error: required tool '$1' is not installed for target '$2'" >&2
        exit 1
    }
}

require_file() {
    [ -f "$1" ] || {
        echo "error: required file missing: $1" >&2
        exit 1
    }
}

copy_matches() {
    local dest="$1"
    shift
    mkdir -p "$dest"
    local found=0
    for pattern in "$@"; do
        local dir="${pattern%/*}"
        local name="${pattern##*/}"
        while IFS= read -r file; do
            [ -n "$file" ] || continue
            cp -f "$file" "$dest/"
            found=1
        done < <(find "$dir" -maxdepth 1 -type f -name "$name" 2>/dev/null || true)
    done
    [ "$found" -eq 1 ] || {
        echo "error: expected artifact pattern not found: $*" >&2
        exit 1
    }
}

write_checksums() {
    local root="$1"
    mkdir -p "$root"
    if find "$root" -type f ! -name 'SHA256SUMS*' | grep -q .; then
        (
            cd "$root"
            find . -type f ! -name 'SHA256SUMS*' -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS.txt
        )
    fi
}

validate_contract() {
    require_file "$BASE_ANDROID_DIR/gradlew"
    require_file "$BASE_ANDROID_DIR/app/build.gradle.kts"
    require_file "$BASE_ANDROID_DIR/license-admin/build.gradle.kts"
    require_file "$BASE_ANDROID_DIR/license-admin/src/main/AndroidManifest.xml"
    require_file "$GUI_DIR/package.json"
    require_file "$GUI_DIR/src-tauri/tauri.conf.json"
    require_file "$IOS_DIR/project.yml"
    require_file "$IOS_DIR/ExportOptions.plist"
    require_file "$OPENWRT_PACKAGE_SCRIPT"
}

selected_targets() {
    if printf '%s\n' "${TARGETS[@]}" | grep -qx all; then
        printf '%s\n' android ios windows linux openwrt dashboard extensions
    else
        printf '%s\n' "${TARGETS[@]}"
    fi
}

build_android() {
    require_tool java android
    mkdir -p "$ARTIFACT_DIR/android"
    (cd "$BASE_ANDROID_DIR" && ./gradlew :app:assembleRelease :license-admin:assembleRelease)
    copy_matches "$ARTIFACT_DIR/android" \
        "$BASE_ANDROID_DIR/app/build/outputs/apk/release/*.apk" \
        "$BASE_ANDROID_DIR/license-admin/build/outputs/apk/release/*.apk"
}

build_ios() {
    require_tool xcodegen ios
    require_tool xcodebuild ios
    mkdir -p "$ARTIFACT_DIR/ios"

    # Shared, fail-closed iOS packaging helpers (project/scheme resolution,
    # unsigned archive support, Mach-O verification).
    # shellcheck source=./ios-packaging.sh
    IOS_ROOT_OVERRIDE="$REPO_ROOT" source "$SCRIPT_DIR/ios-packaging.sh"

    local project_dir scheme xcodeproj archive export_dir
    project_dir="$(ios_resolve_project_dir "$REPO_ROOT")" || {
        echo "error: no xcodegen project.yml found under $REPO_ROOT" >&2
        exit 1
    }
    (cd "$project_dir" && xcodegen generate)
    scheme="${IOS_SCHEME:-$(ios_project_scheme "$project_dir" || true)}"
    [[ -n "$scheme" ]] || scheme="V2RayEZ"
    xcodeproj="$(ios_resolve_xcodeproj "$project_dir")"
    [[ -d "$xcodeproj" ]] || {
        echo "error: Xcode project not found: $xcodeproj (run xcodegen generate)" >&2
        exit 1
    }
    ios_place_core_lib "$project_dir" "$REPO_ROOT"

    archive="$ARTIFACT_DIR/ios/Vor.xcarchive"
    rm -rf "$archive"
    (
        cd "$project_dir"
        # Options are passed as a real argv array; a quoted option string is a
        # single argument to xcodebuild and can never be parsed.
        if ios_signing_available; then
            xcodebuild -project "$xcodeproj" -scheme "$scheme" -configuration Release \
                -archivePath "$archive" archive -allowProvisioningUpdates
        else
            xcodebuild -project "$xcodeproj" -scheme "$scheme" -configuration Release \
                -archivePath "$archive" archive \
                CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
                CODE_SIGN_IDENTITY="" AD_HOC_CODE_SIGNING_ALLOWED=YES
        fi
    )
    [[ -d "$archive" ]] || {
        echo "error: xcodebuild did not produce $archive" >&2
        exit 1
    }

    if ios_signing_available; then
        export_dir="$ARTIFACT_DIR/ios/export"
        rm -rf "$export_dir"
        (
            cd "$project_dir"
            xcodebuild -exportArchive -archivePath "$archive" \
                -exportOptionsPlist ExportOptions.plist -exportPath "$export_dir" \
                -allowProvisioningUpdates
        )
        copy_matches "$ARTIFACT_DIR/ios" "$export_dir/*.ipa"
    else
        # Xcode cannot export an unsigned .ipa, so ship the real .xcarchive.
        ios_zip_archive "$archive" "$ARTIFACT_DIR/ios/Vor-v${VERSION}-ios-unsigned.xcarchive.zip"
    fi
}

build_windows() {
    require_tool npm windows
    require_tool cargo windows
    if [ "${OS:-}" != "Windows_NT" ] && [ "${V2RAYEZ_WINDOWS_BUILDER:-0}" != "1" ]; then
        echo "error: Windows .exe build requested on a non-Windows host. Use a Windows runner or set V2RAYEZ_WINDOWS_BUILDER=1 when cross-toolchains are installed." >&2
        exit 1
    fi
    mkdir -p "$ARTIFACT_DIR/windows"
    (cd "$GUI_DIR" && npm ci && npm run prepare:sidecars && npm run build:windows)
    copy_matches "$ARTIFACT_DIR/windows" \
        "$GUI_DIR/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe" \
        "$GUI_DIR/src-tauri/target/release/bundle/nsis/*.exe"
}

build_linux() {
    require_tool npm linux
    require_tool cargo linux
    mkdir -p "$ARTIFACT_DIR/linux"
    (cd "$GUI_DIR" && npm ci && npm run prepare:sidecars && npm run build:linux)
    copy_matches "$ARTIFACT_DIR/linux" \
        "$GUI_DIR/src-tauri/target/release/bundle/deb/*.deb" \
        "$GUI_DIR/src-tauri/target/release/bundle/rpm/*.rpm" \
        "$GUI_DIR/src-tauri/target/release/bundle/appimage/*.AppImage"
}

build_openwrt() {
    mkdir -p "$ARTIFACT_DIR/openwrt"
    "$OPENWRT_PACKAGE_SCRIPT" --out-dir "$ARTIFACT_DIR/openwrt"
    copy_matches "$ARTIFACT_DIR/openwrt" "$ARTIFACT_DIR/openwrt/*unifiedshield*.ipk"
}

build_dashboard() {
    require_tool npm dashboard
    mkdir -p "$ARTIFACT_DIR/dashboard"
    (cd "$REPO_ROOT/MICAFP/dashboard" && npm ci && npm run build)
    tar -C "$REPO_ROOT/MICAFP/dashboard" -czf "$ARTIFACT_DIR/dashboard/v2rayez-dashboard-v$VERSION.next-build.tar.gz" .next package.json next.config.ts
}

build_extensions() {
    require_tool npm extensions
    require_tool cargo extensions
    require_tool wasm-pack extensions
    mkdir -p "$ARTIFACT_DIR/extensions"
    (
        cd "$REPO_ROOT/MICAFP/extensions/wasm-obfuscator"
        wasm-pack build --target web --out-dir pkg
    )
    (
        cd "$REPO_ROOT/MICAFP"
        npm ci --ignore-scripts --workspace extensions/chrome --workspace extensions/firefox
        npm run build --workspace extensions/chrome
        npm run build --workspace extensions/firefox
    )
    tar -C "$REPO_ROOT/MICAFP/extensions/chrome" -czf "$ARTIFACT_DIR/extensions/v2rayez-chrome-extension-v$VERSION.tar.gz" dist
    tar -C "$REPO_ROOT/MICAFP/extensions/firefox" -czf "$ARTIFACT_DIR/extensions/v2rayez-firefox-extension-v$VERSION.tar.gz" dist
}

validate_contract
if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "release_artifact_contract: PASS"
    exit 0
fi

mkdir -p "$ARTIFACT_DIR"
for target in $(selected_targets); do
    case "$target" in
        android) build_android ;;
        ios) build_ios ;;
        windows) build_windows ;;
        linux) build_linux ;;
        openwrt) build_openwrt ;;
        dashboard) build_dashboard ;;
        extensions) build_extensions ;;
        '') ;;
        *)
            echo "error: unsupported target: $target" >&2
            exit 2
            ;;
    esac
done

write_checksums "$ARTIFACT_DIR"
echo "release_artifacts: PASS -> $ARTIFACT_DIR"
