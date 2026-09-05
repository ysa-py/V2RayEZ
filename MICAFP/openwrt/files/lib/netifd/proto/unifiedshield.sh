#!/bin/sh
# netifd protocol integration for Vor Universal / UnifiedShield.
# This script lets OpenWrt manage the VPN as a first-class network interface:
#   config interface 'vpn'
#       option proto 'unifiedshield'
#       option tun_name 'us0'
#       option ip_address '172.19.0.1'
#       option ip_prefix '24'
#       option dns_server '223.5.5.5'

[ -n "$INCLUDE_ONLY" ] || {
    . /lib/functions.sh
    . ../netifd-proto.sh
    init_proto "$@"
}

proto_unifiedshield_init_config() {
    no_device=1
    available=1

    proto_config_add_string "enabled"
    proto_config_add_string "core"
    proto_config_add_string "server"
    proto_config_add_int "server_port"
    proto_config_add_string "tun_name"
    proto_config_add_string "ip_address"
    proto_config_add_int "ip_prefix"
    proto_config_add_int "mtu"
    proto_config_add_string "dns_server"
    proto_config_add_string "dns_server_backup"
    proto_config_add_boolean "kill_switch"
    proto_config_add_boolean "split_tunnel"
}

_proto_unifiedshield_error() {
    local config="$1"
    local code="$2"
    proto_notify_error "$config" "$code"
    proto_block_restart "$config"
}

proto_unifiedshield_setup() {
    local config="$1"
    local enabled core server server_port tun_name ip_address ip_prefix mtu dns_server dns_server_backup kill_switch split_tunnel

    json_get_vars enabled core server server_port tun_name ip_address ip_prefix mtu dns_server dns_server_backup kill_switch split_tunnel

    [ -n "$enabled" ] || enabled="$(uci -q get unifiedshield.default.enabled 2>/dev/null || echo 0)"
    [ "$enabled" = "1" ] || {
        _proto_unifiedshield_error "$config" "DISABLED"
        return 1
    }

    [ -n "$tun_name" ] || tun_name="$(uci -q get unifiedshield.default.tun_name 2>/dev/null || echo us0)"
    [ -n "$ip_address" ] || ip_address="$(uci -q get unifiedshield.default.ip_address 2>/dev/null || echo 172.19.0.1)"
    [ -n "$ip_prefix" ] || ip_prefix="$(uci -q get unifiedshield.default.ip_prefix 2>/dev/null || echo 24)"
    [ -n "$mtu" ] || mtu="$(uci -q get unifiedshield.default.mtu 2>/dev/null || echo 1380)"
    [ -n "$dns_server" ] || dns_server="$(uci -q get unifiedshield.default.dns_server 2>/dev/null || echo 223.5.5.5)"
    [ -n "$dns_server_backup" ] || dns_server_backup="$(uci -q get unifiedshield.default.dns_server_backup 2>/dev/null || echo 119.29.29.29)"

    if ! /usr/libexec/unifiedshield/license-gate.sh enforce; then
        logger -t unifiedshield-netifd "interface setup blocked by license gate"
        _proto_unifiedshield_error "$config" "LICENSE_DENIED"
        return 1
    fi

    if ! /etc/init.d/unifiedshield start; then
        logger -t unifiedshield-netifd "failed to start unifiedshield service"
        _proto_unifiedshield_error "$config" "DAEMON_START_FAILED"
        return 1
    fi

    proto_init_update "$tun_name" 1
    proto_add_ipv4_address "$ip_address" "$ip_prefix"
    [ -n "$mtu" ] && ip link set dev "$tun_name" mtu "$mtu" 2>/dev/null || true
    [ -n "$dns_server" ] && proto_add_dns_server "$dns_server"
    [ -n "$dns_server_backup" ] && proto_add_dns_server "$dns_server_backup"
    proto_send_update "$config"

    logger -t unifiedshield-netifd "interface $config is up on $tun_name ($ip_address/$ip_prefix)"
}

proto_unifiedshield_teardown() {
    local config="$1"
    local tun_name
    json_get_vars tun_name
    [ -n "$tun_name" ] || tun_name="$(uci -q get unifiedshield.default.tun_name 2>/dev/null || echo us0)"

    /etc/init.d/unifiedshield stop >/dev/null 2>&1 || true
    proto_init_update "$tun_name" 0
    proto_send_update "$config"
    logger -t unifiedshield-netifd "interface $config is down"
}

[ -n "$INCLUDE_ONLY" ] || add_protocol unifiedshield
