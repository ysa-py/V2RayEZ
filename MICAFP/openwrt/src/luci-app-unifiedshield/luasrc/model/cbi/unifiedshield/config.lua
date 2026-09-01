-- V2RayEZ Universal / UnifiedShield LuCI CBI model
-- Additive License + AI Engine settings. Secrets are referenced by protected-file aliases
-- and are never echoed back by this form.

local fs = require "nixio.fs"
local sys = require "luci.sys"
local util = require "luci.util"
local m, s, o
local license_token_file = "/etc/unifiedshield/license.token"
local license_grace_file = "/etc/unifiedshield/license.grace"
local ai_secret_dir = "/etc/unifiedshield/ai-secrets"

local function safe_alias(alias)
    alias = (alias or ""):gsub("^%s+", ""):gsub("%s+$", "")
    if alias:match("^[A-Za-z0-9_.-]+$") then
        return alias
    end
    return nil
end

m = Map("unifiedshield", translate("V2RayEZ Universal"),
    translate("Router-grade anti-censorship gateway using the preserved UnifiedShield/OpenWrt pipeline. License checks fail closed before the daemon starts; AI providers can be added without code changes and fall back to the local router policy when external APIs are blocked."))

s = m:section(TypedSection, "unifiedshield", translate("General Settings"))
s.anonymous = true
s.addremove = false

o = s:option(Flag, "enabled", translate("Enable"), translate("Enable or disable the V2RayEZ router service"))
o.rmempty = false
o.default = "0"

o = s:option(ListValue, "core", translate("Protocol Core"), translate("Auto-switch activates when the DPI score crosses the configured threshold"))
o:value("xray", translate("Xray (VLESS/VMess/Trojan/Shadowsocks)"))
o:value("naive", translate("NaïveProxy HTTP/2"))
o:value("hysteria2", translate("Hysteria2 QUIC"))
o:value("tuic", translate("TUIC QUIC"))
o:value("aether", translate("Aether / MSN-GUARD core"))
o.default = "xray"
o.rmempty = false

o = s:option(Flag, "auto_core_switch", translate("Auto Core Switch"), translate("Automatically switch core when DPI is detected"))
o.default = "1"
o.rmempty = false

s = m:section(TypedSection, "unifiedshield", translate("Server Configuration"))
s.anonymous = true
s.addremove = false

o = s:option(Value, "server", translate("Server Address"), translate("VPN server hostname or IP address"))
o.datatype = "host"
o.rmempty = false

o = s:option(Value, "server_port", translate("Server Port"), translate("VPN server port"))
o.datatype = "port"
o.default = "443"
o.rmempty = false

o = s:option(Value, "password", translate("Password / UUID"), translate("Authentication password, UUID, or inbound secret"))
o.password = true
o.rmempty = false

s = m:section(TypedSection, "unifiedshield", translate("Network Settings"))
s.anonymous = true
s.addremove = false

o = s:option(Value, "tun_name", translate("TUN Device Name"), translate("Name for the TUN interface"))
o.default = "us0"
o.rmempty = false

o = s:option(Value, "mtu", translate("MTU"), translate("Maximum Transmission Unit"))
o.datatype = "range(576,9000)"
o.default = "1380"
o.rmempty = false

o = s:option(Value, "ip_address", translate("TUN IP Address"), translate("Local IP address for the TUN interface"))
o.default = "172.19.0.1"
o.datatype = "ip4addr"
o.rmempty = false

o = s:option(Value, "ip_prefix", translate("IP Prefix Length"), translate("Subnet prefix length"))
o.datatype = "uinteger"
o.default = "24"
o.rmempty = false

s = m:section(TypedSection, "unifiedshield", translate("DNS and Routing"))
s.anonymous = true
s.addremove = false

o = s:option(ListValue, "dns_server", translate("Primary DNS"), translate("CDN-friendly DNS; Cloudflare may be blocked in Iran"))
o:value("223.5.5.5", translate("Alibaba DNS (223.5.5.5)"))
o:value("119.29.29.29", translate("Tencent DNS (119.29.29.29)"))
o:value("1.12.12.12", translate("Tencent Backup (1.12.12.12)"))
o.default = "223.5.5.5"
o.rmempty = false

o = s:option(Value, "dns_server_backup", translate("Backup DNS"), translate("Secondary DNS server"))
o.datatype = "ipaddr"
o.default = "119.29.29.29"
o.rmempty = false

o = s:option(Flag, "kill_switch", translate("Kill Switch"), translate("Block traffic if the tunnel drops"))
o.rmempty = false
o.default = "1"

o = s:option(Flag, "split_tunnel", translate("Split Tunneling"), translate("Keep configured domestic ranges direct"))
o.rmempty = false
o.default = "1"

o = s:option(Value, "dpi_threshold", translate("DPI threshold"), translate("Auto-switch core when the DPI score is higher than this value"))
o.datatype = "range(0,1)"
o.default = "0.72"
o.rmempty = false

s = m:section(TypedSection, "unifiedshield", translate("License"), translate("The service fails closed when no valid signed serial, online validation, or signed grace token is available."))
s.anonymous = true
s.addremove = false

o = s:option(DummyValue, "license_last_result", translate("Last result"))
o.default = translate("not_validated")

o = s:option(DummyValue, "license_last_reason", translate("Last reason"))
o.default = ""

o = s:option(Value, "license_account_id", translate("Account ID"), translate("Per-user account identifier expected in the signed serial"))
o.rmempty = true

o = s:option(Value, "license_validation_url", translate("Validation URL"), translate("Dashboard URL or full /api/licenses/validate endpoint"))
o.datatype = "url"
o.rmempty = true

o = s:option(Value, "license_device_label", translate("Device label"), translate("Human-readable router label shown in dashboard activations"))
o.rmempty = true

o = s:option(Value, "license_public_key_file", translate("Public key file"), translate("PEM public key used by the local license gate"))
o.default = "/etc/unifiedshield/license-public.pem"
o.rmempty = false

o = s:option(Flag, "license_allow_offline_grace", translate("Offline grace"), translate("Allow signed offline grace tokens after online validation"))
o.default = "1"
o.rmempty = false

o = s:option(TextValue, "_license_serial", translate("Install signed serial"), translate("Paste a signed V2RayEZ serial here. It is written to /etc/unifiedshield/license.token with root-only permissions and is never stored in UCI or echoed back."))
o.rows = 3
o.rmempty = true
function o.cfgvalue()
    return ""
end
function o.write(self, section, value)
    value = (value or ""):gsub("^%s+", ""):gsub("%s+$", "")
    if value ~= "" then
        fs.mkdirr("/etc/unifiedshield")
        fs.writefile(license_token_file, value .. "\n")
        sys.call("chmod 600 " .. util.shellquote(license_token_file) .. " >/dev/null 2>&1")
    end
end

o = s:option(Button, "_license_clear_serial", translate("Clear serial"), translate("Remove the installed serial and offline grace token from this router"))
o.inputstyle = "reset"
function o.write()
    fs.remove(license_token_file)
    fs.remove(license_grace_file)
    m.uci:set("unifiedshield", "default", "license_last_result", "DENIED")
    m.uci:set("unifiedshield", "default", "license_last_reason", "serial_cleared")
    m.uci:commit("unifiedshield")
end

o = s:option(Button, "license_validate_now", translate("Validate now"), translate("Runs the local license gate without starting the tunnel"))
o.inputstyle = "apply"
function o.write()
    sys.call("/usr/libexec/unifiedshield/license-gate.sh validate >/tmp/unifiedshield-license-check.log 2>&1")
end

o = s:option(DummyValue, "license_note", translate("Serial storage"))
function o.cfgvalue()
    if fs.access(license_token_file) then
        return translate("Serial is installed in /etc/unifiedshield/license.token with root-only permissions")
    end
    return translate("Paste a signed serial above or install it manually at /etc/unifiedshield/license.token; LuCI never displays the serial value")
end

s = m:section(TypedSection, "unifiedshield", translate("AI Engine"), translate("External providers can be configured without code changes; blocked/unreachable calls fall back to local anti-DPI guidance."))
s.anonymous = true
s.addremove = false

o = s:option(Flag, "ai_engine_enabled", translate("Enable AI Engine"))
o.default = "1"
o.rmempty = false

o = s:option(Flag, "ai_auto_fallback", translate("Automatic local fallback"))
o.default = "1"
o.rmempty = false

o = s:option(Value, "ai_selected_provider", translate("Selected provider ID"))
o.default = "local-v2rayez"
o.rmempty = false

o = s:option(Value, "ai_local_model", translate("Local model/policy"))
o.default = "v2rayez-anti-dpi-local"
o.rmempty = false

o = s:option(Button, "ai_test_selected", translate("Test selected provider"))
o.inputstyle = "apply"
function o.write()
    sys.call("/usr/libexec/unifiedshield/ai-provider-test.lua >/tmp/unifiedshield-ai-test.log 2>&1")
end

o = s:option(DummyValue, "ai_last_result", translate("Last AI test"))
o.default = translate("not_tested")

s = m:section(TypedSection, "ai_provider", translate("AI Providers"), translate("Add OpenAI-compatible, Anthropic, Gemini, generic HTTP, or local providers. Secrets are referenced by alias files under /etc/unifiedshield/ai-secrets/."))
s.anonymous = false
s.addremove = true
s.template = "cbi/tblsection"

o = s:option(Value, "name", translate("Name"))
o.rmempty = false

o = s:option(ListValue, "type", translate("Type"))
o:value("local", translate("Local fallback"))
o:value("openai", translate("OpenAI-compatible"))
o:value("anthropic", translate("Anthropic"))
o:value("gemini", translate("Gemini"))
o:value("generic", translate("Generic HTTP"))
o.default = "local"
o.rmempty = false

o = s:option(Flag, "enabled", translate("Enabled"))
o.default = "1"
o.rmempty = false

o = s:option(Value, "base_url", translate("Base URL"))
o.rmempty = true

o = s:option(Value, "endpoint", translate("Endpoint"))
o.rmempty = true

o = s:option(Value, "model", translate("Model"))
o.default = "v2rayez-anti-dpi-local"
o.rmempty = true

o = s:option(Value, "api_key_alias", translate("API key alias"), translate("Secret is read from /etc/unifiedshield/ai-secrets/<alias>.secret"))
o.rmempty = true

o = s:option(TextValue, "_api_key_secret", translate("Install API key secret"), translate("Paste or rotate this provider's API key. The value is written to /etc/unifiedshield/ai-secrets/<alias>.secret with root-only permissions and is never stored in UCI or echoed back."))
o.rows = 2
o.rmempty = true
function o.cfgvalue()
    return ""
end
function o.write(self, section, value)
    value = (value or ""):gsub("^%s+", ""):gsub("%s+$", "")
    if value ~= "" then
        local alias = safe_alias(m.uci:get("unifiedshield", section, "api_key_alias") or section)
        if alias then
            fs.mkdirr(ai_secret_dir)
            local secret_path = ai_secret_dir .. "/" .. alias .. ".secret"
            fs.writefile(secret_path, value .. "\n")
            sys.call("chmod 600 " .. util.shellquote(secret_path) .. " >/dev/null 2>&1")
        end
    end
end

o = s:option(Button, "_api_key_clear_secret", translate("Clear API key secret"), translate("Remove the alias secret file for this provider"))
o.inputstyle = "reset"
function o.write(self, section)
    local alias = safe_alias(m.uci:get("unifiedshield", section, "api_key_alias") or section)
    if alias then
        fs.remove(ai_secret_dir .. "/" .. alias .. ".secret")
    end
end

o = s:option(TextValue, "headers_json", translate("Headers JSON"))
o.rows = 2
o.default = "{}"
o.rmempty = true

o = s:option(TextValue, "request_template", translate("Request template"))
o.rows = 3
o.rmempty = true

o = s:option(Value, "response_path", translate("Response path"))
o.default = "text"
o.rmempty = true

o = s:option(Value, "timeout_ms", translate("Timeout ms"))
o.datatype = "range(2000,120000)"
o.default = "30000"
o.rmempty = false

return m
