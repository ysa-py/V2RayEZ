#!/bin/sh
# Vor Universal / UnifiedShield OpenWrt license gate.
# This script is intentionally fail-closed. A universal-core-backed native verifier
# (`/usr/bin/v2rayez-license-gate`) is preferred for local Ed25519 and signed grace
# verification. The shell fallback only performs online validation and refuses
# offline starts when that verifier is unavailable.

set -eu

MODE="${1:-enforce}"
CONFIG="${UCI_CONFIG:-unifiedshield}"
SECTION="${UCI_SECTION:-default}"
STATE_DIR="/etc/unifiedshield"
TOKEN_FILE="${STATE_DIR}/license.token"
GRACE_FILE="${STATE_DIR}/license.grace"
DEVICE_FILE="${STATE_DIR}/device.id"
NATIVE_GATE="${V2RAYEZ_LICENSE_GATE:-/usr/bin/v2rayez-license-gate}"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR" 2>/dev/null || true

uci_get() { uci -q get "$CONFIG.$SECTION.$1" 2>/dev/null || true; }
uci_set() { uci -q set "$CONFIG.$SECTION.$1=$2" 2>/dev/null || true; }
commit_status() { uci -q commit "$CONFIG" 2>/dev/null || true; }

set_status() {
    uci_set license_last_result "$1"
    uci_set license_last_reason "$2"
    [ -n "${3:-}" ] && uci_set license_expires_at "$3"
    [ -n "${4:-}" ] && uci_set license_offline_grace_until "$4"
    [ -n "${5:-}" ] && uci_set license_last_server_time "$5"
    commit_status
}

deny() {
    set_status DENIED "$1"
    logger -t unifiedshield "license gate denied: $1"
    exit 1
}

allow() {
    set_status ALLOWED "$1" "${2:-}" "${3:-}" "${4:-}"
    logger -t unifiedshield "license gate allowed: $1"
    exit 0
}

json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

ensure_device_id() {
    if [ ! -s "$DEVICE_FILE" ]; then
        if command -v hexdump >/dev/null 2>&1; then
            hexdump -n 32 -e '32/1 "%02x"' /dev/urandom > "$DEVICE_FILE"
        else
            date +%s%N | sha256sum | awk '{print $1}' > "$DEVICE_FILE"
        fi
        chmod 600 "$DEVICE_FILE" 2>/dev/null || true
    fi
    cat "$DEVICE_FILE"
}

normalize_validation_url() {
    local base="$1"
    [ -n "$base" ] || return 0
    base="${base%/}"
    case "$base" in
        */api/licenses/validate) printf '%s' "$base" ;;
        *) printf '%s/api/licenses/validate' "$base" ;;
    esac
}

post_json() {
    local url="$1"
    local payload="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsS --max-time 25 -H 'Content-Type: application/json' -H 'Accept: application/json' -d "$payload" "$url"
    elif command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch -q -O - --timeout=25 --header='Content-Type: application/json' --header='Accept: application/json' --post-data="$payload" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- --timeout=25 --header='Content-Type: application/json' --header='Accept: application/json' --post-data="$payload" "$url"
    else
        return 127
    fi
}

store_grace_from_response() {
    local body="$1"
    local token
    token=$(printf '%s' "$body" | sed -n 's/.*"graceToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
    if [ -n "$token" ]; then
        printf '%s' "$token" > "$GRACE_FILE"
        chmod 600 "$GRACE_FILE" 2>/dev/null || true
    fi
}

if [ ! -s "$TOKEN_FILE" ]; then
    deny license_missing
fi
chmod 600 "$TOKEN_FILE" 2>/dev/null || true
SERIAL=$(cat "$TOKEN_FILE")
[ -n "$SERIAL" ] || deny license_missing

VALIDATION_URL=$(normalize_validation_url "$(uci_get license_validation_url)")
ACCOUNT_ID=$(uci_get license_account_id)
DEVICE_LABEL=$(uci_get license_device_label)
PUBLIC_KEY_FILE=$(uci_get license_public_key_file)
ALLOW_GRACE=$(uci_get license_allow_offline_grace)
LAST_SERVER_TIME=$(uci_get license_last_server_time)
DEVICE_ID=$(ensure_device_id)
PLATFORM="openwrt"

if [ -x "$NATIVE_GATE" ]; then
    exec "$NATIVE_GATE" \
        --mode "$MODE" \
        --license-file "$TOKEN_FILE" \
        --grace-file "$GRACE_FILE" \
        --public-key-file "${PUBLIC_KEY_FILE:-/etc/unifiedshield/license-public.pem}" \
        --validation-url "$VALIDATION_URL" \
        --account-id "$ACCOUNT_ID" \
        --device-id "$DEVICE_ID" \
        --platform "$PLATFORM" \
        --device-label "${DEVICE_LABEL:-OpenWrt router}" \
        --client-last-server-time "$LAST_SERVER_TIME" \
        --uci-config "$CONFIG" \
        --uci-section "$SECTION" \
        $( [ "$ALLOW_GRACE" = "1" ] && printf '%s' --allow-offline-grace )
fi

# Shell fallback: online validation only. Offline grace is deliberately not accepted here
# because Ed25519 grace-token verification requires the native universal-core gate.
[ -n "$VALIDATION_URL" ] || deny license_native_gate_missing

PAYLOAD=$(printf '{"licenseKey":"%s","deviceId":"%s","accountId":"%s","platform":"%s","deviceLabel":"%s","clientLastServerTime":"%s"}' \
    "$(json_escape "$SERIAL")" \
    "$(json_escape "$DEVICE_ID")" \
    "$(json_escape "$ACCOUNT_ID")" \
    "$PLATFORM" \
    "$(json_escape "${DEVICE_LABEL:-OpenWrt router}")" \
    "$(json_escape "$LAST_SERVER_TIME")")

BODY=$(post_json "$VALIDATION_URL" "$PAYLOAD" 2>/tmp/unifiedshield-license-http.err || true)
if printf '%s' "$BODY" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
    store_grace_from_response "$BODY"
    EXPIRES=$(printf '%s' "$BODY" | sed -n 's/.*"expiresAt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
    GRACE_UNTIL=$(printf '%s' "$BODY" | sed -n 's/.*"offlineGraceUntil"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
    SERVER_TIME=$(printf '%s' "$BODY" | sed -n 's/.*"serverTime"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
    allow server_valid "$EXPIRES" "$GRACE_UNTIL" "$SERVER_TIME"
fi

REASON=$(printf '%s' "$BODY" | sed -n 's/.*"reason"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -n "$REASON" ] || REASON="server_unreachable_or_denied"
deny "$REASON"
