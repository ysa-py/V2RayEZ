#!/usr/bin/env lua
-- V2RayEZ Universal / UnifiedShield OpenWrt AI Provider Gateway smoke test.
-- Provider definitions live in UCI. Secrets are read from protected alias files and
-- are never written back to UCI or LuCI output.

local uci = require "luci.model.uci".cursor()
local json = require "luci.jsonc"

local CONFIG = os.getenv("UCI_CONFIG") or "unifiedshield"
local SECTION = os.getenv("UCI_SECTION") or "default"
local SECRET_DIR = "/etc/unifiedshield/ai-secrets"

local function get(opt, default)
    return uci:get(CONFIG, SECTION, opt) or default or ""
end

local function set_status(value)
    uci:set(CONFIG, SECTION, "ai_last_result", value)
    uci:commit(CONFIG)
end

local function shell_quote(value)
    value = tostring(value or "")
    return "'" .. value:gsub("'", "'\\''") .. "'"
end

local function read_file(path)
    local f = io.open(path, "r")
    if not f then return "" end
    local data = f:read("*a") or ""
    f:close()
    return data:gsub("%s+$", "")
end

local function canonical_provider_id(value)
    value = tostring(value or "")
    if value == "local-aether" or value == "local_aether" then
        return "local-v2rayez"
    end
    return value
end

local function selected_provider()
    local selected = canonical_provider_id(get("ai_selected_provider", "local-v2rayez"))
    local fallback = nil
    uci:foreach(CONFIG, "ai_provider", function(section)
        local section_name = canonical_provider_id(section[".name"])
        local id = canonical_provider_id(section.id or section_name)
        if not fallback then fallback = section end
        if id == selected or section_name == selected:gsub("%-", "_") then
            fallback = section
            return false
        end
    end)
    return fallback
end

local function local_fallback(provider, reason)
    local name = provider and (provider.name or provider.id) or "V2RayEZ Local AI"
    local text = "local_fallback:" .. name .. ":" .. reason .. ": retry conservative obfuscation, then Smart Core switch"
    set_status(text)
    print(text)
    os.exit(0)
end

if get("ai_engine_enabled", "1") ~= "1" then
    set_status("disabled")
    print("disabled")
    os.exit(0)
end

local provider = selected_provider()
if not provider then
    local_fallback(nil, "provider_missing")
end

local provider_type = provider.type or "local"
local enabled = provider.enabled or "1"
if enabled ~= "1" then
    local_fallback(provider, "provider_disabled")
end
if provider_type == "local" or tostring(provider.base_url or ""):match("^local://") then
    local_fallback(provider, "local_ready")
end

local base_url = tostring(provider.base_url or ""):gsub("/+$", "")
if not base_url:match("^https?://") then
    local_fallback(provider, "bad_base_url")
end
local endpoint = tostring(provider.endpoint or ""):gsub("^/+", "")
local url = endpoint ~= "" and (base_url .. "/" .. endpoint) or base_url
local alias = provider.api_key_alias or ""
local api_key = alias ~= "" and read_file(SECRET_DIR .. "/" .. alias .. ".secret") or ""

local prompt = "Suggest a safe V2RayEZ/OpenWrt anti-DPI fallback for a blocked TLS connection."
local payload
if provider.request_template and provider.request_template ~= "" then
    payload = provider.request_template
        :gsub("%${model}", provider.model or "")
        :gsub("%${prompt_json}", json.stringify(prompt))
        :gsub("%${prompt}", prompt)
        :gsub("%${api_key}", api_key)
else
    payload = json.stringify({
        model = provider.model or "",
        messages = {
            { role = "system", content = "Return concise anti-DPI tuning guidance." },
            { role = "user", content = prompt }
        }
    })
end

local header_values = { "Content-Type: application/json", "Accept: application/json" }
if api_key ~= "" then
    if provider_type == "anthropic" then
        table.insert(header_values, "x-api-key: " .. api_key)
        table.insert(header_values, "anthropic-version: 2023-06-01")
    else
        table.insert(header_values, "Authorization: Bearer " .. api_key)
    end
end
local curl_headers, fetch_headers = "", ""
for _, header in ipairs(header_values) do
    curl_headers = curl_headers .. " -H " .. shell_quote(header)
    fetch_headers = fetch_headers .. " --header=" .. shell_quote(header)
end

local timeout = math.max(2, math.floor(tonumber(provider.timeout_ms or "30000") / 1000))
local cmd
if os.execute("command -v curl >/dev/null 2>&1") == 0 then
    cmd = "curl -fsS --max-time " .. timeout .. curl_headers .. " -d " .. shell_quote(payload) .. " " .. shell_quote(url)
elseif os.execute("command -v uclient-fetch >/dev/null 2>&1") == 0 then
    cmd = "uclient-fetch -q -O - --timeout=" .. timeout .. fetch_headers .. " --post-data=" .. shell_quote(payload) .. " " .. shell_quote(url)
elseif os.execute("command -v wget >/dev/null 2>&1") == 0 then
    cmd = "wget -qO- --timeout=" .. timeout .. fetch_headers .. " --post-data=" .. shell_quote(payload) .. " " .. shell_quote(url)
else
    local_fallback(provider, "http_client_missing")
end

local handle = io.popen(cmd .. " 2>/tmp/unifiedshield-ai-test.err")
local body = handle and handle:read("*a") or ""
local ok = handle and handle:close()
if not ok or body == "" then
    if get("ai_auto_fallback", "1") == "1" then
        local_fallback(provider, "external_unreachable")
    end
    set_status("external_failed")
    print("external_failed")
    os.exit(1)
end

local parsed = json.parse(body)
local text = "external_ok"
if parsed then
    if parsed.choices and parsed.choices[1] and parsed.choices[1].message then
        text = parsed.choices[1].message.content or text
    elseif parsed.content and parsed.content[1] then
        text = parsed.content[1].text or text
    elseif parsed.candidates and parsed.candidates[1] and parsed.candidates[1].content and parsed.candidates[1].content.parts then
        text = parsed.candidates[1].content.parts[1].text or text
    elseif parsed.text then
        text = parsed.text
    end
end
text = tostring(text):gsub(api_key, "[redacted]")
set_status("external_ok:" .. text:sub(1, 96))
print(text)
