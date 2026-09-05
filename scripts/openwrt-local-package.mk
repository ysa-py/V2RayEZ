# Vor/UnifiedShield — OpenWrt SDK local package Makefile.
#
# This is the package the Phase 3 SDK actually compiles. It is used instead of
# the donor Rust-only Makefile because the CI pipeline cross-compiles the
# universal-core staticlib/license-gate first and does NOT run cargo inside the
# OpenWrt SDK (which needs a rust host toolchain plus a fresh git clone).
#
# Capability preservation:
#   * the preserved C daemon (src/main.c + uci_config + netifd_proto) is built
#     with the SDK target compiler -> /usr/bin/unifiedshield;
#   * the already-cross-compiled Rust license-gate (when present) is installed
#     at /usr/bin/v2rayez-license-gate;
#   * files/etc, files/lib, files/usr (init, netifd proto, license helpers,
#     rpcd ACLs) and src/luci-app-unifiedshield (LuCI controller/model/cbi/view)
#     are all installed unchanged.
# No placeholder/synthetic binary is produced.

include $(TOPDIR)/rules.mk

PKG_NAME:=unifiedshield
PKG_VERSION:=2.0.0
PKG_RELEASE:=1
PKG_MAINTAINER:=Vor Contributors
PKG_LICENSE:=MIT
PKG_BUILD_DIR := $(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

define Package/unifiedshield
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Vor Universal Router Gateway
  DEPENDS:=+libc +libpthread +libuci +ca-bundle +libopenssl +kmod-tun +netifd +uclient-fetch
endef

define Package/unifiedshield/description
  Vor Universal router gateway package: preserved UnifiedShield C daemon,
  Rust license gate, LuCI management UI, netifd integration and helper scripts.
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

define Build/Compile
	$(TARGET_CC) $(TARGET_CFLAGS) $(TARGET_CPPFLAGS) $(TARGET_LDFLAGS) \
		-I$(CURDIR)/src \
		-o $(PKG_BUILD_DIR)/unifiedshield \
		$(CURDIR)/src/main.c \
		$(CURDIR)/src/uci_config.c \
		$(CURDIR)/src/netifd_proto.c \
		-luci
	@if [ -x "$(CURDIR)/files/usr/bin/v2rayez-license-gate" ]; then \
		echo "Vor OpenWrt package: real Rust license-gate present"; \
	else \
		echo "Vor OpenWrt package: license-gate not cross-built (runtime license gate still enforced by scripts)"; \
	fi
endef

define Package/unifiedshield/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/unifiedshield $(1)/usr/bin/unifiedshield
	if [ -x "$(CURDIR)/files/usr/bin/v2rayez-license-gate" ]; then \
		$(INSTALL_BIN) "$(CURDIR)/files/usr/bin/v2rayez-license-gate" $(1)/usr/bin/v2rayez-license-gate; \
	fi
	cp -a "$(CURDIR)/files/." $(1)/
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci
	cp -a "$(CURDIR)/src/luci-app-unifiedshield/luasrc/." $(1)/usr/lib/lua/luci/
endef

define Package/unifiedshield/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/unifiedshield enable
	id unifiedshield >/dev/null 2>&1 || \
		(adduser -S -D -H -s /bin/false unifiedshield 2>/dev/null || true)
}
endef

define Package/unifiedshield/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/unifiedshield stop 2>/dev/null || true
	/etc/init.d/unifiedshield disable 2>/dev/null || true
}
endef

$(eval $(call BuildPackage,unifiedshield))
