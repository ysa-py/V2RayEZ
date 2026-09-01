-- LuCI Controller for UnifiedShield
-- Provides web interface for managing the VPN service
-- Accessible at: http://router.lan/cgi-bin/luci/admin/services/unifiedshield

module("luci.controller.unifiedshield", package.seeall)

local fs = require("nixio.fs")

function index()
    if not fs.access("/etc/config/unifiedshield") then
        return
    end

    local page = entry(
        {"admin", "services", "unifiedshield"},
        alias("admin", "services", "unifiedshield", "status"),
        _("UnifiedShield VPN"),
        60
    )
    page.dependent = true
    page.acl_depends = { "luci-app-unifiedshield" }

    entry(
        {"admin", "services", "unifiedshield", "status"},
        template("unifiedshield/status"),
        _("Status"),
        10
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "config"},
        cbi("unifiedshield/config"),
        _("Configuration"),
        20
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "advanced"},
        template("unifiedshield/advanced"),
        _("Advanced"),
        30
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "log"},
        call("action_log"),
        _("Log"),
        40
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "status_json"},
        call("action_status"),
        nil
    ).leaf = true

    -- API endpoints used by LuCI templates and automation
    entry(
        {"admin", "services", "unifiedshield", "api", "status"},
        call("action_status"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "api", "start"},
        call("action_api_start"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "api", "stop"},
        call("action_api_stop"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "api", "restart"},
        call("action_api_restart"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "api", "resilience"},
        call("action_api_resilience"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "api", "log"},
        call("action_log"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "start"},
        call("action_start"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "stop"},
        call("action_stop"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "restart"},
        call("action_restart"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "switch_core"},
        call("action_switch_core"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "validate_license"},
        call("action_validate_license"),
        nil
    ).leaf = true

    entry(
        {"admin", "services", "unifiedshield", "test_ai_provider"},
        call("action_test_ai_provider"),
        nil
    ).leaf = true
end

-- Get VPN status
function action_status()
    local sys = require("luci.sys")
    local json = require("luci.jsonc")

    local running = sys.call("pgrep -f unifiedshield >/dev/null 2>&1") == 0

    local status = {
        running = running,
        core = uci_get("unifiedshield", "default", "core") or "xray",
        server = uci_get("unifiedshield", "default", "server") or "Not configured",
        dns_server = uci_get("unifiedshield", "default", "dns_server") or "223.5.5.5",
        kill_switch = uci_get("unifiedshield", "default", "kill_switch") == "1",
        split_tunnel = uci_get("unifiedshield", "default", "split_tunnel") == "1",
        dpi_threshold = tonumber(uci_get("unifiedshield", "default", "dpi_threshold") or "0.72"),
        uptime = "N/A",
        download = "0 B",
        upload = "0 B",
        license_result = uci_get("unifiedshield", "default", "license_last_result") or "not_validated",
        license_reason = uci_get("unifiedshield", "default", "license_last_reason") or "",
        license_expires_at = uci_get("unifiedshield", "default", "license_expires_at") or "",
        ai_enabled = uci_get("unifiedshield", "default", "ai_engine_enabled") == "1",
        ai_selected_provider = uci_get("unifiedshield", "default", "ai_selected_provider") or "local-v2rayez",
        ai_last_result = uci_get("unifiedshield", "default", "ai_last_result") or "not_tested"
    }

    if running then
        -- Get uptime and traffic stats from the running service
        local stats = sys.exec("cat /var/run/unifiedshield/stats.json 2>/dev/null")
        if stats and stats ~= "" then
            local stats_obj = json.parse(stats)
            if stats_obj then
                status.uptime = stats_obj.uptime or "N/A"
                status.download = stats_obj.download or "0 B"
                status.upload = stats_obj.upload or "0 B"
                status.dpi_score = stats_obj.dpi_score or 0
            end
        end
    end

    luci.http.prepare_content("application/json")
    luci.http.write_json(status)
end

-- Get log
function action_log()
    local sys = require("luci.sys")
    local log = sys.exec("logread -e unifiedshield | tail -100 2>/dev/null || cat /var/log/unifiedshield.log 2>/dev/null | tail -100")

    luci.http.prepare_content("text/plain")
    luci.http.write(log)
end

-- Start VPN
function action_start()
    local sys = require("luci.sys")
    sys.call("/etc/init.d/unifiedshield start >/dev/null 2>&1")
    luci.http.redirect(luci.dispatcher.build_url("admin/services/unifiedshield/status"))
end

-- Stop VPN
function action_stop()
    local sys = require("luci.sys")
    sys.call("/etc/init.d/unifiedshield stop >/dev/null 2>&1")
    luci.http.redirect(luci.dispatcher.build_url("admin/services/unifiedshield/status"))
end

-- Restart VPN
function action_restart()
    local sys = require("luci.sys")
    sys.call("/etc/init.d/unifiedshield restart >/dev/null 2>&1")
    luci.http.redirect(luci.dispatcher.build_url("admin/services/unifiedshield/status"))
end

-- API start/stop/restart variants used by the status template.
function action_api_start()
    local sys = require("luci.sys")
    local output = sys.exec("/etc/init.d/unifiedshield start 2>&1")
    local success = sys.call("pgrep -f unifiedshield >/dev/null 2>&1") == 0
    luci.http.prepare_content("application/json")
    luci.http.write_json({
        success = success,
        message = success and "UnifiedShield started" or "UnifiedShield failed to start",
        output = output
    })
end

function action_api_stop()
    local sys = require("luci.sys")
    sys.exec("/etc/init.d/unifiedshield stop 2>&1")
    local success = sys.call("pgrep -f unifiedshield >/dev/null 2>&1") ~= 0
    luci.http.prepare_content("application/json")
    luci.http.write_json({
        success = success,
        message = success and "UnifiedShield stopped" or "UnifiedShield is still running"
    })
end

function action_api_restart()
    local sys = require("luci.sys")
    local output = sys.exec("/etc/init.d/unifiedshield restart 2>&1")
    local success = sys.call("pgrep -f unifiedshield >/dev/null 2>&1") == 0
    luci.http.prepare_content("application/json")
    luci.http.write_json({
        success = success,
        message = success and "UnifiedShield restarted" or "UnifiedShield restart failed",
        output = output
    })
end

function action_api_resilience()
    local running = uci_get("unifiedshield", "default", "enabled") == "1"
    local core = uci_get("unifiedshield", "default", "core") or "xray"
    luci.http.prepare_content("application/json")
    luci.http.write_json({
        fallbackChain = {
            { name = "PrimaryTransport", active = running },
            { name = "ChineseCdnWorker", active = running and (core == "naive" or core == "hysteria2" or core == "tuic") },
            { name = "P2pLibp2pRelay", active = uci_get("unifiedshield", "default", "p2p_enabled") == "1" },
            { name = "DohTunnel", active = (uci_get("unifiedshield", "default", "dns_mode") or "doh") == "doh" },
            { name = "IcmpTunnel", active = (uci_get("unifiedshield", "default", "transport") or "") == "icmp" },
            { name = "MeshNetwork", active = uci_get("unifiedshield", "default", "yggdrasil_enabled") == "1" },
            { name = "TorBridgeSnowflake", active = false },
            { name = "TorBridgeMeek", active = false }
        },
        dpiProbability = tonumber(uci_get("unifiedshield", "default", "dpi_threshold") or "0.72"),
        ucbExplorationRate = tonumber(uci_get("unifiedshield", "default", "ai_exploration_rate") or "0.15"),
        coreSwitches24h = tonumber(uci_get("unifiedshield", "default", "core_switches_24h") or "0"),
        blePeers = tonumber(uci_get("unifiedshield", "default", "ble_mesh_peers") or "0"),
        wifiPeers = tonumber(uci_get("unifiedshield", "default", "wifi_aware_peers") or "0")
    })
end

-- Switch core
function action_switch_core()
    local http = require("luci.http")
    local core = http.formvalue("core")

    if core and (core == "xray" or core == "naive" or core == "hysteria2" or core == "tuic") then
        local uci = require("luci.model.uci").cursor()
        uci:set("unifiedshield", "default", "core", core)
        uci:commit("unifiedshield")

        -- Send SIGUSR1 to running process to trigger core switch
        local sys = require("luci.sys")
        sys.call("pkill -USR1 unifiedshield 2>/dev/null")
    end

    luci.http.redirect(luci.dispatcher.build_url("admin/services/unifiedshield/status"))
end

-- Validate license without starting the tunnel
function action_validate_license()
    local sys = require("luci.sys")
    local code = sys.call("/usr/libexec/unifiedshield/license-gate.sh validate >/tmp/unifiedshield-license-check.log 2>&1")
    luci.http.prepare_content("application/json")
    luci.http.write_json({
        success = code == 0,
        result = uci_get("unifiedshield", "default", "license_last_result") or "DENIED",
        reason = uci_get("unifiedshield", "default", "license_last_reason") or "license_check_failed",
        log = sys.exec("tail -40 /tmp/unifiedshield-license-check.log 2>/dev/null")
    })
end

-- Test selected AI provider without writing secrets to LuCI
function action_test_ai_provider()
    local sys = require("luci.sys")
    local code = sys.call("/usr/libexec/unifiedshield/ai-provider-test.lua >/tmp/unifiedshield-ai-test.log 2>&1")
    luci.http.prepare_content("application/json")
    luci.http.write_json({
        success = code == 0,
        result = uci_get("unifiedshield", "default", "ai_last_result") or "not_tested",
        log = sys.exec("tail -40 /tmp/unifiedshield-ai-test.log 2>/dev/null")
    })
end

-- Helper: get UCI value
function uci_get(config, section, option)
    local uci = require("luci.model.uci").cursor()
    return uci:get(config, section, option)
end
