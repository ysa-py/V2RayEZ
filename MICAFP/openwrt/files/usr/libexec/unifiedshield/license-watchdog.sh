#!/bin/sh
# V2RayEZ Universal / UnifiedShield OpenWrt runtime license watchdog.
# Runs beside the procd daemon instance and hard-stops the service as soon as the
# native or online license gate denies the signed serial, revocation check, or
# offline grace window.

set -eu

LICENSE_GATE="${V2RAYEZ_LICENSE_GATE_SCRIPT:-/usr/libexec/unifiedshield/license-gate.sh}"
SERVICE_INIT="${V2RAYEZ_SERVICE_INIT:-/etc/init.d/unifiedshield}"
MAX_SLEEP_SECONDS="${V2RAYEZ_LICENSE_WATCHDOG_MAX_SLEEP:-60}"

case "$MAX_SLEEP_SECONDS" in
    ''|*[!0-9]*) MAX_SLEEP_SECONDS=60 ;;
esac
[ "$MAX_SLEEP_SECONDS" -ge 1 ] 2>/dev/null || MAX_SLEEP_SECONDS=60

remaining_seconds_from_json() {
    sed -n 's/.*"remainingSeconds"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -n1
}

sleep_for_result() {
    local body="$1"
    local remaining
    local wait="$MAX_SLEEP_SECONDS"
    remaining=$(printf '%s' "$body" | remaining_seconds_from_json || true)
    case "$remaining" in
        ''|*[!0-9]*) ;;
        0) wait=1 ;;
        *)
            if [ "$remaining" -lt "$wait" ]; then
                wait="$remaining"
            fi
            ;;
    esac
    [ "$wait" -ge 1 ] 2>/dev/null || wait=1
    sleep "$wait"
}

while :; do
    if output=$("$LICENSE_GATE" validate 2>&1); then
        sleep_for_result "$output"
    else
        logger -t unifiedshield-license-watchdog "license hard cutoff: ${output:-license_denied}"
        "$SERVICE_INIT" stop >/dev/null 2>&1 || true
        exit 1
    fi
done
