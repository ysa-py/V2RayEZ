# =============================================================================
# MICAFP-UnifiedShield-6.0 — OpenWrt Package Makefile
#
# Build the UnifiedShield daemon and LuCI web interface for OpenWrt.
#
# Supported targets:
#   mipsel_24kc     — Most common MIPS routers (TP-Link, D-Link, etc.)
#   x86_64         — x86 routers and VMs
#   aarch64_cortex-a53 — ARM routers (NanoPi, etc.)
#
# Usage:
#   make package/unifiedshield/compile V=s
#
# Prerequisites:
#   - OpenWrt SDK for the target architecture
#   - Rust cross-compilation toolchain installed via rustup
# =============================================================================

include $(TOPDIR)/rules.mk

# ---------------------------------------------------------------------------
# Package definition
# ---------------------------------------------------------------------------

PKG_NAME:=unifiedshield
PKG_VERSION:=6.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=MICAFP Team <team@micAFP.org>
PKG_LICENSE:=MIT

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/MICAFP/UnifiedShield.git
PKG_SOURCE_VERSION:=v$(PKG_VERSION)
PKG_MIRROR_HASH:=skip

PKG_BUILD_DEPENDS:=rust/host

include $(INCLUDE_DIR)/package.mk

# ---------------------------------------------------------------------------
# Package metadata
# ---------------------------------------------------------------------------

define Package/unifiedshield
  SECTION:=net
  CATEGORY:=Network
  TITLE:=UnifiedShield Anti-Censorship VPN Daemon
  DEPENDS:=+libc +libpthread +ca-bundle +libopenssl +kmod-tun +netifd +uclient-fetch
  PKGARCH:=all
endef

define Package/unifiedshield/description
  UnifiedShield is an anti-censorship VPN designed for Iran.
  It uses WebTransport/HTTPS tunnels through CDN workers with
  traffic obfuscation to bypass DPI and the national firewall.

  Features:
  - WebTransport/HTTPS tunneling through CDN workers
  - Traffic obfuscation (WASM + XOR + rotation)
  - TLS fragmentation to defeat SNI-based filtering
  - Adversarial traffic shaping (AI-based)
  - P2P mesh via Yggdrasil overlay
  - Covert channels (NTP, acoustic, BLE mesh, WiFi NAN, SMS)
  - LuCI web management interface
endef

define Package/unifiedshield/conffiles
/etc/config/unifiedshield
/etc/unifiedshield/license-public.pem
/etc/unifiedshield/license.token
/etc/unifiedshield/license.grace
/etc/unifiedshield/cdn-endpoints.json
/etc/unifiedshield/p2p-bootstrap-peers.json
/etc/unifiedshield/isp-profiles.json
endef

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

# Rust target mapping for OpenWrt architectures
ifeq ($(CONFIG_ARCH),mipsel)
  RUST_TARGET:=mipsel-unknown-linux-musl
else ifeq ($(CONFIG_ARCH),x86_64)
  RUST_TARGET:=x86_64-unknown-linux-musl
else ifeq ($(CONFIG_ARCH),aarch64)
  RUST_TARGET:=aarch64-unknown-linux-musl
else
  RUST_TARGET:=mipsel-unknown-linux-musl
endif

# Cargo environment
CARGO_HOME:=$(STAGING_DIR_HOSTPKG)/cargo
RUSTC:=$(STAGING_DIR_HOSTPKG)/rust/bin/rustc
CARGO:=$(STAGING_DIR_HOSTPKG)/rust/bin/cargo

define Build/Compile
	# Set up cross-compilation environment
	mkdir -p $(PKG_BUILD_DIR)/daemon/.cargo
	echo '[target.$(RUST_TARGET)]' > $(PKG_BUILD_DIR)/daemon/.cargo/config.toml
	echo 'linker = "$(TARGET_CC)"' >> $(PKG_BUILD_DIR)/daemon/.cargo/config.toml

	# Build the daemon with release optimizations
	cd $(PKG_BUILD_DIR)/daemon && \
		CARGO_HOME=$(CARGO_HOME) \
		RUSTFLAGS="-C target-feature=+crt-static -C opt-level=z -C panic=abort" \
		$(CARGO) build \
			--release \
			--target $(RUST_TARGET) \
			--no-default-features \
			--features openwrt \
			--manifest-path $(PKG_BUILD_DIR)/daemon/Cargo.toml
endef

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------

define Package/unifiedshield/install
	# Daemon binary
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) \
		$(PKG_BUILD_DIR)/daemon/target/$(RUST_TARGET)/release/shield-daemon \
		$(1)/usr/bin/unifiedshield

	# Configuration files
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/unifiedshield $(1)/etc/config/unifiedshield

	$(INSTALL_DIR) $(1)/etc/unifiedshield
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/configs/cdn-endpoints.json $(1)/etc/unifiedshield/
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/configs/p2p-bootstrap-peers.json $(1)/etc/unifiedshield/
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/configs/isp-profiles.json $(1)/etc/unifiedshield/
	$(INSTALL_CONF) ./files/etc/unifiedshield/iran_ip_ranges.txt $(1)/etc/unifiedshield/

	# Init script and netifd protocol integration
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/unifiedshield $(1)/etc/init.d/unifiedshield

	$(INSTALL_DIR) $(1)/lib/netifd/proto
	$(INSTALL_BIN) ./files/lib/netifd/proto/unifiedshield.sh $(1)/lib/netifd/proto/unifiedshield.sh

	# License/AI helper scripts
	$(INSTALL_DIR) $(1)/usr/libexec/unifiedshield
	$(INSTALL_BIN) ./files/usr/libexec/unifiedshield/license-gate.sh $(1)/usr/libexec/unifiedshield/license-gate.sh
	$(INSTALL_BIN) ./files/usr/libexec/unifiedshield/ai-provider-test.lua $(1)/usr/libexec/unifiedshield/ai-provider-test.lua

	# LuCI web interface: controller, models, CBI forms, templates, and ACL.
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) ./src/luci-app-unifiedshield/luasrc/controller/unifiedshield.lua \
		$(1)/usr/lib/lua/luci/controller/unifiedshield.lua

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model
	$(INSTALL_DATA) ./src/luci-app-unifiedshield/luasrc/model/unifiedshield.lua \
		$(1)/usr/lib/lua/luci/model/unifiedshield.lua

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/cbi
	$(INSTALL_DATA) ./src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield.lua \
		$(1)/usr/lib/lua/luci/model/cbi/unifiedshield.lua

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/cbi/unifiedshield
	$(INSTALL_DATA) ./src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua \
		$(1)/usr/lib/lua/luci/model/cbi/unifiedshield/config.lua

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/unifiedshield
	$(INSTALL_DATA) ./files/usr/lib/lua/luci/view/unifiedshield/status.htm \
		$(1)/usr/lib/lua/luci/view/unifiedshield/status.htm
	$(INSTALL_DATA) ./files/usr/lib/lua/luci/view/unifiedshield/advanced.htm \
		$(1)/usr/lib/lua/luci/view/unifiedshield/advanced.htm

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/luci-app-unifiedshield.json \
		$(1)/usr/share/rpcd/acl.d/luci-app-unifiedshield.json
endef

define Package/unifiedshield/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	# Enable the service on install
	/etc/init.d/unifiedshield enable
	# Add unifiedshield user (non-privileged) when user management is available
	id unifiedshield >/dev/null 2>&1 || \
		(echo "Adding unifiedshield system user" && \
		(adduser -S -D -H -s /bin/false unifiedshield 2>/dev/null || true))
}
endef

define Package/unifiedshield/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	# Stop and disable the service
	/etc/init.d/unifiedshield stop 2>/dev/null || true
	/etc/init.d/unifiedshield disable 2>/dev/null || true
}
endef

$(eval $(call BuildPackage,unifiedshield))
