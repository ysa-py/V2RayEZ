#!/usr/bin/env bash
# Build the universal/generic V2RayEZ OpenWrt LuCI .ipk from a target-specific
# OpenWrt SDK. This script does not fabricate packages without an SDK: it fails
# clearly when the SDK/toolchain is missing so release evidence stays honest.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MICAFP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MICAFP_DIR/.." && pwd)"
PACKAGE_SRC="$MICAFP_DIR/openwrt"
SDK_DIR="${OPENWRT_SDK:-}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/artifacts/openwrt}"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)}"
CHECK_ONLY=0

usage() {
    cat <<USAGE
Usage: $0 [--sdk /path/to/openwrt-sdk] [--out-dir /path/to/artifacts] [--jobs N] [--check]

Options:
  --sdk       Target-specific OpenWrt SDK root. Can also be set with OPENWRT_SDK.
  --out-dir   Directory where built unifiedshield*.ipk files and SHA256SUMS are copied.
  --jobs      Parallel make jobs. Defaults to detected CPU count.
  --check     Validate package metadata/scripts without requiring an SDK.
USAGE
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --sdk)
            SDK_DIR="${2:-}"
            shift 2
            ;;
        --out-dir)
            OUT_DIR="${2:-}"
            shift 2
            ;;
        --jobs)
            JOBS="${2:-}"
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

require_file() {
    [ -f "$1" ] || {
        echo "error: required OpenWrt package file missing: $1" >&2
        exit 1
    }
}

validate_package_tree() {
    require_file "$PACKAGE_SRC/Makefile"
    require_file "$PACKAGE_SRC/files/etc/config/unifiedshield"
    require_file "$PACKAGE_SRC/files/etc/init.d/unifiedshield"
    require_file "$PACKAGE_SRC/files/lib/netifd/proto/unifiedshield.sh"
    require_file "$PACKAGE_SRC/files/usr/libexec/unifiedshield/license-gate.sh"
    require_file "$PACKAGE_SRC/files/usr/libexec/unifiedshield/license-watchdog.sh"
    require_file "$PACKAGE_SRC/files/usr/libexec/unifiedshield/ai-provider-test.lua"
    require_file "$PACKAGE_SRC/src/luci-app-unifiedshield/Makefile"

    local source_version
    source_version="$(sed -n 's/^PKG_SOURCE_VERSION:=//p' "$PACKAGE_SRC/Makefile" | head -n1)"
    case "$source_version" in
        [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
        *)
            echo "error: PKG_SOURCE_VERSION must be a pinned 40-character commit SHA, got: ${source_version:-<empty>}" >&2
            exit 1
            ;;
    esac
}

validate_sdk() {
    [ -n "$SDK_DIR" ] || {
        echo "error: OpenWrt SDK not configured. Set OPENWRT_SDK or pass --sdk." >&2
        exit 1
    }
    SDK_DIR="$(cd "$SDK_DIR" && pwd)"
    [ -f "$SDK_DIR/Makefile" ] && [ -f "$SDK_DIR/rules.mk" ] && [ -d "$SDK_DIR/include" ] || {
        echo "error: $SDK_DIR does not look like an OpenWrt SDK root" >&2
        exit 1
    }
}

validate_package_tree
if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "openwrt_package_check: PASS"
    exit 0
fi
validate_sdk

case "$JOBS" in
    ''|*[!0-9]*)
        echo "error: --jobs must be a positive integer" >&2
        exit 2
        ;;
esac
[ "$JOBS" -ge 1 ] 2>/dev/null || {
    echo "error: --jobs must be >= 1" >&2
    exit 2
}

FEED_DST="$SDK_DIR/package/network/services/unifiedshield"
[ -n "$FEED_DST" ] && [ "$FEED_DST" != "/" ] || {
    echo "error: refusing unsafe feed destination" >&2
    exit 1
}

rm -rf "$FEED_DST"
mkdir -p "$(dirname "$FEED_DST")"
cp -a "$PACKAGE_SRC" "$FEED_DST"

make -C "$SDK_DIR" defconfig
make -C "$SDK_DIR" package/unifiedshield/clean V=s
make -C "$SDK_DIR" package/unifiedshield/compile V=s -j"$JOBS"

mkdir -p "$OUT_DIR"
find "$SDK_DIR/bin" -type f -name '*unifiedshield*.ipk' -exec cp -f {} "$OUT_DIR" \;

if ! find "$OUT_DIR" -maxdepth 1 -type f -name '*unifiedshield*.ipk' | grep -q .; then
    echo "error: OpenWrt build completed but no unifiedshield .ipk was found under $SDK_DIR/bin" >&2
    exit 1
fi

(
    cd "$OUT_DIR"
    sha256sum ./*unifiedshield*.ipk > SHA256SUMS
)

echo "openwrt_package_build: PASS -> $OUT_DIR"
