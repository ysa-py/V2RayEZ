# Milestone 32 Report — Runtime License Watchdog Hard Cutoff

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Tighten native/runtime hard-cutoff behavior so an already-running tunnel is stopped promptly when the signed serial expires, revocation/server validation fails, or the signed offline-grace window closes.

## Changes Applied

- Desktop/Tauri:
  - Kept the pre-connect `license::enforce()` result instead of discarding it.
  - Passed initial `remaining_seconds` into the connected-session watchdog.
  - Replaced the fixed initial 60-second watchdog sleep with `license_watchdog_delay()`, capped at 60 seconds and shortened to the actual remaining license/grace window when below 60 seconds.
  - Preserved generation and process-running guards so stale watchdog tasks cannot stop a newer session.
- Android core app:
  - Removed the duplicate `delay(waitMs)` in the connected-session license watchdog.
  - Added a 1-second fail-safe delay for impossible/edge allowed states with `remainingSeconds <= 0`; normal near-expiry sessions still wake at the exact remaining seconds when under 60 seconds.
- iOS Network Extension:
  - Updated both `PacketTunnelProvider` and `TunnelManager` watchdog loops to validate first, then sleep for `min(remainingSeconds, 60)` with a 1-second lower bound, instead of always waiting 60 seconds before the first check.
- OpenWrt:
  - Added `/usr/libexec/unifiedshield/license-watchdog.sh` to keep validating the running service and call `/etc/init.d/unifiedshield stop` on license denial.
  - Installed the watchdog from the OpenWrt Makefile.
  - Started the watchdog as a second procd instance beside the daemon and stopped it explicitly in `stop_service()`.
- CI/static gates:
  - Added `tools/runtime_license_watchdog_gate.mjs` to assert the hard-cutoff wiring on desktop, Android, iOS, and OpenWrt source paths.
  - Added the new gate to `docs/ci/github-workflows/universal-source-gates.yml.sample`.
- Stabilized the signed serial E2E tamper test so it mutates the payload segment, guaranteeing a signature-verification denial instead of occasionally producing a different unknown-token hash.

## Validation Run

```bash
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node --check tools/license_crypto_selftest.mjs
node tools/license_crypto_selftest.mjs
node --check tools/license_serial_e2e_selftest.mjs
node tools/license_serial_e2e_selftest.mjs
node --check tools/v2rayez_identity_gate.mjs
node tools/v2rayez_identity_gate.mjs
node --check tools/ai_provider_gateway_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-watchdog.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
python3 - <<'PY'
from pathlib import Path
files = [
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/PacketTunnelProvider.swift'),
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/TunnelManager.swift'),
]
for path in files:
    text = path.read_text()
    assert text.count('{') == text.count('}'), f'brace imbalance: {path}'
    assert 'let status = await' in text and 'Task.sleep(nanoseconds: UInt64(waitSeconds)' in text
    print('swift watchdog static pass', path)
PY
python3 - <<'PY'
from pathlib import Path
text = Path('docs/ci/github-workflows/universal-source-gates.yml.sample').read_text()
assert 'node tools/runtime_license_watchdog_gate.mjs' in text
assert 'node tools/license_serial_e2e_selftest.mjs' in text
assert '\t' not in text
print('runtime watchdog workflow template check pass')
PY
npm test --prefix V2RayEZ-GUI
git diff --check
```

Result: PASS.

## Scope Note

This milestone improves hard-cutoff source behavior and local static/runtime-script validation. Real runtime proof on Windows/macOS/Linux desktop, Android device/emulator, iOS device/simulator, and OpenWrt router remains blocked until the required native toolchains, signing credentials, devices, router image/SDK, and network test environment are available.
