#!/usr/bin/env bash
# Build OpenWrt IPK via OpenWrt SDK + Makefile pipeline -> LuCI .ipk
# Supports mipsel_24kc, aarch64_cortex-a53, x86_64
# Includes retry, caching, detailed logging
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET="mipsel_24kc"
RUST_TARGET="mipsel-unknown-linux-musl"
OUT_DIR="$ROOT/dist-openwrt"
JOBS="$(nproc 2>/dev/null || echo 4)"
SDK_DIR=""
NO_FALLBACK=0

VERSION="2.0.0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --rust-target) RUST_TARGET="$2"; shift 2 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --sdk) SDK_DIR="$2"; shift 2 ;;
    --no-fallback) NO_FALLBACK=1; shift ;;
    --jobs) JOBS="$2"; shift 2 ;;
    *) echo "Unknown arg $1, ignoring"; shift ;;
  esac
done

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
LOG="$ROOT/openwrt-${TARGET}.log"
echo "[openwrt] Target=$TARGET Rust=$RUST_TARGET Out=$OUT_DIR" | tee "$LOG"

retry() {
  local max=2 count=0 delay=3
  while true; do
    if "$@" 2>&1 | tee -a "$LOG"; then return 0; fi
    count=$((count+1))
    if [[ $count -ge $max ]]; then echo "[openwrt] FAILED after $max attempts: $*" | tee -a "$LOG"; return 1; fi
    echo "[openwrt] Retry $count/$max after ${delay}s: $*" | tee -a "$LOG"
    sleep $delay
    delay=$((delay*2))
  done
}

# Determine SDK URL based on target
get_sdk_url() {
  case "$TARGET" in
    mipsel_24kc)
      echo "https://downloads.openwrt.org/releases/23.05.5/targets/ramips/mt7621/openwrt-sdk-23.05.5-ramips-mt7621_gcc-12.3.0_musl.Linux-x86_64.tar.xz"
      ;;
    aarch64_cortex-a53)
      echo "https://downloads.openwrt.org/releases/23.05.5/targets/rockchip/armv8/openwrt-sdk-23.05.5-rockchip-armv8_gcc-12.3.0_musl.Linux-x86_64.tar.xz"
      ;;
    x86_64)
      echo "https://downloads.openwrt.org/releases/23.05.5/targets/x86/64/openwrt-sdk-23.05.5-x86-64_gcc-12.3.0_musl.Linux-x86_64.tar.xz"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Download SDK if not provided
if [[ -z "$SDK_DIR" ]]; then
  SDK_DIR="$ROOT/openwrt-sdk/$TARGET"
  if [[ ! -f "$SDK_DIR/Makefile" ]]; then
    URL="$(get_sdk_url)"
    if [[ -n "$URL" ]]; then
      echo "[openwrt] Downloading SDK from $URL" | tee -a "$LOG"
      mkdir -p "$ROOT/openwrt-sdk"
      TMP_TAR="$ROOT/openwrt-sdk/${TARGET}.tar.xz"
      rm -f "$TMP_TAR"
      if retry curl -fSL --connect-timeout 10 --max-time 180 -o "$TMP_TAR" "$URL" || retry wget --timeout=15 --tries=2 -O "$TMP_TAR" "$URL"; then
        if [[ -s "$TMP_TAR" ]]; then
          mkdir -p "$SDK_DIR.tmp"
          if tar -xf "$TMP_TAR" -C "$SDK_DIR.tmp" --strip-components=1 2>&1 | tee -a "$LOG"; then
            rm -rf "$SDK_DIR"
            mv "$SDK_DIR.tmp" "$SDK_DIR"
            echo "[openwrt] SDK unpacked successfully to $SDK_DIR" | tee -a "$LOG"
          else
            echo "[openwrt] SDK tar extraction failed, will use fallback" | tee -a "$LOG"
            rm -rf "$SDK_DIR.tmp"
          fi
        else
          echo "[openwrt] SDK archive is empty, using fallback" | tee -a "$LOG"
          rm -f "$TMP_TAR"
        fi
      else
        echo "[openwrt] SDK download failed, will use fallback" | tee -a "$LOG"
        rm -f "$TMP_TAR"
      fi
    else
      echo "[openwrt] No SDK URL for $TARGET, using fallback" | tee -a "$LOG"
    fi
  fi
fi

echo "[openwrt] SDK_DIR=$SDK_DIR" | tee -a "$LOG"
ls -la "$SDK_DIR" 2>&1 | head -n 20 | tee -a "$LOG" || true

# Fail-closed mode: the caller (usually the Phase 3 CI pipeline) has already
# provisioned a real OpenWrt SDK and requires any missing/unsupported SDK or
# failed SDK compile to stop the build. It must never fall back to manual or
# standalone placeholder packaging.
if [[ "$NO_FALLBACK" == "1" ]]; then
  if [[ ! -f "$SDK_DIR/Makefile" || ! -f "$SDK_DIR/rules.mk" ]]; then
    echo "[openwrt] ERROR (--no-fallback): real OpenWrt SDK is required but missing at $SDK_DIR" | tee -a "$LOG" >&2
    exit 1
  fi
fi

# If SDK exists, try real build
if [[ -f "$SDK_DIR/Makefile" && -f "$SDK_DIR/rules.mk" ]]; then
  echo "[openwrt] Attempting SDK build for $TARGET" | tee -a "$LOG"
  # OpenWrt SDK resolves package targets as `package/<layer>/<name>/compile`
  # only when the Makefile sits directly below the `package/` root (e.g.
  # `package/unifiedshield`). Placing it under `package/network/services/...`
  # makes `make package/unifiedshield/compile` report "No rule to make target"
  # even though the SDK build actually works.
  FEED_DST="$SDK_DIR/package/unifiedshield"
  rm -rf "$FEED_DST"
  mkdir -p "$(dirname "$FEED_DST")"
  # Copy package source (prefer MICAFP/openwrt).
  # The checked-in MICAFP/openwrt Makefile tries to compile the Rust daemon by
  # re-running cargo inside the SDK (rust host + git source download). CI has
  # already produced the real cross-compiled binaries, so the SDK package uses
  # the local prebuilt package Makefile below. All files/LuCI/scripts are kept;
  # no placeholder is generated.
  if [[ -d "$ROOT/MICAFP/openwrt" ]]; then
    cp -a "$ROOT/MICAFP/openwrt" "$FEED_DST"
    cp -v "$ROOT/scripts/openwrt-local-package.mk" "$FEED_DST/Makefile" 2>&1 | tee -a "$LOG" || true
  else
    # Create minimal package from universal-core/openwrt
    mkdir -p "$FEED_DST"
    cat > "$FEED_DST/Makefile" <<'MF'
include $(TOPDIR)/rules.mk
PKG_NAME:=unifiedshield
PKG_VERSION:=2.0.0
PKG_RELEASE:=1
PKG_MAINTAINER:=V2RayEZ
PKG_LICENSE:=MIT
include $(INCLUDE_DIR)/package.mk
define Package/unifiedshield
  SECTION:=net
  CATEGORY:=Network
  TITLE:=V2RayEZ Universal
  DEPENDS:=+libc +libpthread
endef
define Package/unifiedshield/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/v2rayez-license-gate $(1)/usr/bin/v2rayez-license-gate
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/unifiedshield $(1)/etc/config/unifiedshield 2>/dev/null || true
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/unifiedshield $(1)/etc/init.d/unifiedshield 2>/dev/null || true
endef
$(eval $(call BuildPackage,unifiedshield))
MF
  fi

  # Copy prebuilt binary into package if available
  PREBUILT="$(find "$ROOT/core-libs" -name "v2rayez-license-gate" -type f 2>/dev/null | head -n1 || true)"
  if [[ -z "$PREBUILT" ]]; then
    PREBUILT="$(find "$ROOT/universal-core/target" -name "v2rayez-license-gate" -path "*${RUST_TARGET}*" -type f | head -n1 || true)"
  fi
  if [[ -n "$PREBUILT" ]]; then
    echo "[openwrt] Using prebuilt binary $PREBUILT" | tee -a "$LOG"
    mkdir -p "$FEED_DST/files/usr/bin"
    cp -v "$PREBUILT" "$FEED_DST/files/usr/bin/v2rayez-license-gate" 2>&1 | tee -a "$LOG" || true
  fi

  # Build
  (cd "$SDK_DIR" && make defconfig 2>&1 | tee -a "$LOG" || true)
  if [[ "$NO_FALLBACK" == "1" ]]; then
    if ! timeout 600 make -C "$SDK_DIR" package/unifiedshield/compile V=s -j"$JOBS" 2>&1 | tee -a "$LOG"; then
      echo "[openwrt] ERROR (--no-fallback): SDK compile failed/timed out; no fallback allowed" | tee -a "$LOG" >&2
      exit 1
    fi
  else
    timeout 60 make -C "$SDK_DIR" package/unifiedshield/compile V=s -j"$JOBS" 2>&1 | tee -a "$LOG" || echo "[openwrt] SDK compile timed out or failed, falling back to standalone packaging" | tee -a "$LOG"
  fi

  find "$SDK_DIR/bin" -name "*unifiedshield*.ipk" -exec cp -v {} "$OUT_DIR/" \; 2>&1 | tee -a "$LOG" || true
  find "$SDK_DIR/bin" -name "*luci-app-unifiedshield*.ipk" -exec cp -v {} "$OUT_DIR/" \; 2>&1 | tee -a "$LOG" || true
fi

# Fallback manual IPK if SDK build didn't produce (disabled in fail-closed mode)
if [[ -z "$(ls "$OUT_DIR"/*.ipk 2>/dev/null)" ]]; then
  if [[ "$NO_FALLBACK" == "1" ]]; then
    echo "[openwrt] ERROR (--no-fallback): no IPK produced by the OpenWrt SDK; refusing manual placeholder packaging" | tee -a "$LOG" >&2
    exit 1
  fi
  echo "[openwrt] No IPK from SDK, using manual IPK fallback" | tee -a "$LOG"
  bash "$ROOT/universal-core/openwrt/build-ipk.sh" --arch "$TARGET" --rust-target "$RUST_TARGET" --out-dir "$OUT_DIR" --version "${VERSION:-2.0.0}" 2>&1 | tee -a "$LOG" || bash "$ROOT/scripts/manual-ipk-fallback.sh" --arch "$TARGET" --out-dir "$OUT_DIR" --version "${VERSION:-2.0.0}" 2>&1 | tee -a "$LOG"
fi

ls -lh "$OUT_DIR/" | tee -a "$LOG"
if [[ -z "$(ls "$OUT_DIR"/*.ipk 2>/dev/null)" ]]; then
  echo "[openwrt] ERROR: No IPK produced" | tee -a "$LOG"
  exit 1
fi

echo "[openwrt] IPK build SUCCESS for $TARGET" | tee -a "$LOG"
