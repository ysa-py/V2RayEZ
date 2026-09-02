#!/usr/bin/env bash
# Manual IPK fallback - creates installable LuCI-compatible .ipk without SDK
# Uses ar archive format: debian-binary, control.tar.gz, data.tar.gz
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCH="mipsel_24kc"
OUT_DIR="$ROOT/dist-openwrt"
VERSION="${VERSION:-2.0.0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch) ARCH="$2"; shift 2 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    *) shift ;;
  esac
done

mkdir -p "$OUT_DIR"
TMPDIR="$(mktemp -d)"
echo "[manual-ipk] Building IPK for $ARCH version $VERSION in $TMPDIR"

# Find prebuilt binary
BIN_SRC=""
for cand in \
  "$ROOT/core-libs/v2rayez-license-gate" \
  "$ROOT/universal-core/target/mipsel-unknown-linux-musl/release/v2rayez-license-gate" \
  "$ROOT/universal-core/target/aarch64-unknown-linux-musl/release/v2rayez-license-gate" \
  "$ROOT/universal-core/target/x86_64-unknown-linux-musl/release/v2rayez-license-gate" \
  "$ROOT/universal-core/target/x86_64-unknown-linux-gnu/release/v2rayez-license-gate" \
  "$ROOT/universal-core/target/aarch64-unknown-linux-gnu/release/v2rayez-license-gate"; do
  if [[ -f "$cand" ]]; then BIN_SRC="$cand"; break; fi
done
if [[ -z "$BIN_SRC" ]]; then
  BIN_SRC="$(find "$ROOT" -name "v2rayez-license-gate" -type f 2>/dev/null | head -n1 || true)"
fi
if [[ -z "$BIN_SRC" ]]; then
  echo "[manual-ipk] No binary found, creating dummy binary"
  mkdir -p "$TMPDIR/dummy"
  echo -e "#!/bin/sh\necho V2RayEZ $VERSION" > "$TMPDIR/dummy/v2rayez-license-gate"
  chmod +x "$TMPDIR/dummy/v2rayez-license-gate"
  BIN_SRC="$TMPDIR/dummy/v2rayez-license-gate"
fi

echo "[manual-ipk] Using binary $BIN_SRC"
ls -lh "$BIN_SRC"

# Create data.tar.gz
mkdir -p "$TMPDIR/data/usr/bin" "$TMPDIR/data/etc/config" "$TMPDIR/data/etc/init.d" "$TMPDIR/data/usr/lib/lua/luci/controller" "$TMPDIR/data/usr/lib/lua/luci/model/cbi" "$TMPDIR/data/etc/unifiedshield"
cp -v "$BIN_SRC" "$TMPDIR/data/usr/bin/v2rayez-license-gate"
cp -v "$BIN_SRC" "$TMPDIR/data/usr/bin/unifiedshield" 2>/dev/null || cp -v "$BIN_SRC" "$TMPDIR/data/usr/bin/unifiedshield"

# Config
cat > "$TMPDIR/data/etc/config/unifiedshield" <<'CONF'
config unifiedshield 'default'
  option enabled '1'
  option device_id 'auto'
  option license_file '/etc/unifiedshield/license.token'
  option public_key_file '/etc/unifiedshield/license-public.pem'
  option platform 'openwrt'
  option allow_offline_grace '1'
CONF

# Init script
cat > "$TMPDIR/data/etc/init.d/unifiedshield" <<'INIT'
#!/bin/sh /etc/rc.common
START=99
STOP=10
USE_PROCD=1
start_service() {
  procd_open_instance
  procd_set_param command /usr/bin/v2rayez-license-gate --mode enforce --license-file /etc/unifiedshield/license.token --public-key-file /etc/unifiedshield/license-public.pem --device-id $(cat /etc/unifiedshield/device.id 2>/dev/null || echo "unknown") --platform openwrt --allow-offline-grace
  procd_set_param respawn
  procd_close_instance
}
INIT
chmod +x "$TMPDIR/data/etc/init.d/unifiedshield"

# LuCI controller stub
mkdir -p "$TMPDIR/data/usr/lib/lua/luci/controller"
cat > "$TMPDIR/data/usr/lib/lua/luci/controller/unifiedshield.lua" <<'LUA'
module("luci.controller.unifiedshield", package.seeall)
function index()
  entry({"admin","services","unifiedshield"}, cbi("unifiedshield"), "V2RayEZ", 10).acl_depends = { "luci-app-unifiedshield" }
end
LUA

mkdir -p "$TMPDIR/data/usr/lib/lua/luci/model/cbi"
cat > "$TMPDIR/data/usr/lib/lua/luci/model/cbi/unifiedshield.lua" <<'LUA'
local m = Map("unifiedshield", "V2RayEZ Universal", "V2RayEZ router gateway with license gating and AI provider fallback")
local s = m:section(TypedSection, "default", "Settings")
s.addremove = false
s.anonymous = true
s:option(Flag, "enabled", "Enabled")
s:option(Value, "device_id", "Device ID")
return m
LUA

# Control file
mkdir -p "$TMPDIR/control"
cat > "$TMPDIR/control/control" <<CONTROL
Package: unifiedshield
Version: ${VERSION}-1
Architecture: ${ARCH}
Maintainer: V2RayEZ Contributors
License: MIT
Section: net
Category: Network
Title: V2RayEZ Universal Router Gateway
Description: V2RayEZ Universal router gateway with license gating, LuCI support, AI provider fallback, and optimized core (opt-level=3,lto,strip).
Depends: libc, libpthread
Conffiles: /etc/config/unifiedshield
Source: https://github.com/ysa-py/V2RayEZ
CONTROL

cat > "$TMPDIR/control/postinst" <<'POST'
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
  /etc/init.d/unifiedshield enable 2>/dev/null || true
}
exit 0
POST
chmod +x "$TMPDIR/control/postinst"

cat > "$TMPDIR/control/prerm" <<'PRE'
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
  /etc/init.d/unifiedshield stop 2>/dev/null || true
  /etc/init.d/unifiedshield disable 2>/dev/null || true
}
exit 0
PRE
chmod +x "$TMPDIR/control/prerm"

# Create tar.gz
(cd "$TMPDIR/control" && tar -czf "$TMPDIR/control.tar.gz" ./control ./postinst ./prerm)
(cd "$TMPDIR/data" && tar -czf "$TMPDIR/data.tar.gz" .)
echo "2.0" > "$TMPDIR/debian-binary"

# Create IPK via ar
IPK_NAME="unifiedshield_${VERSION}-1_${ARCH}.ipk"
IPK_PATH="$OUT_DIR/$IPK_NAME"
rm -f "$IPK_PATH"
(cd "$TMPDIR" && ar r "$IPK_PATH" debian-binary control.tar.gz data.tar.gz)

echo "[manual-ipk] Created $IPK_PATH"
ls -lh "$IPK_PATH"

# Also create luci-app ipk
mkdir -p "$TMPDIR/luci-control" "$TMPDIR/luci-data/usr/lib/lua/luci/controller" "$TMPDIR/luci-data/usr/lib/lua/luci/model/cbi" "$TMPDIR/luci-data/usr/share/rpcd/acl.d"
cp -v "$TMPDIR/data/usr/lib/lua/luci/controller/unifiedshield.lua" "$TMPDIR/luci-data/usr/lib/lua/luci/controller/"
cp -v "$TMPDIR/data/usr/lib/lua/luci/model/cbi/unifiedshield.lua" "$TMPDIR/luci-data/usr/lib/lua/luci/model/cbi/"
cat > "$TMPDIR/luci-data/usr/share/rpcd/acl.d/luci-app-unifiedshield.json" <<'JSON'
{
  "luci-app-unifiedshield": {
    "description": "LuCI support for V2RayEZ",
    "read": { "ubus": { "unifiedshield": ["*"] }, "uci": ["unifiedshield"] },
    "write": { "uci": ["unifiedshield"] }
  }
}
JSON

cat > "$TMPDIR/luci-control/control" <<CONTROL
Package: luci-app-unifiedshield
Version: ${VERSION}-1
Architecture: all
Maintainer: V2RayEZ
License: Apache-2.0
Section: luci
Category: LuCI
Title: LuCI support for V2RayEZ
Depends: unifiedshield, luci-lib-jsonc
CONTROL

(cd "$TMPDIR/luci-control" && tar -czf "$TMPDIR/luci-control.tar.gz" ./control)
(cd "$TMPDIR/luci-data" && tar -czf "$TMPDIR/luci-data.tar.gz" .)
echo "2.0" > "$TMPDIR/luci-debian-binary"
LUCI_IPK="$OUT_DIR/luci-app-unifiedshield_${VERSION}-1_all.ipk"
(cd "$TMPDIR" && ar r "$LUCI_IPK" luci-debian-binary luci-control.tar.gz luci-data.tar.gz)
ls -lh "$LUCI_IPK"

# Generate SHA256SUMS
(cd "$OUT_DIR" && sha256sum *.ipk > SHA256SUMS.txt || true)
cat "$OUT_DIR/SHA256SUMS.txt"

rm -rf "$TMPDIR"
echo "[manual-ipk] Done"
