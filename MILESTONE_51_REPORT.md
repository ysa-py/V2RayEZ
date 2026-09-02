# Milestone 51 Report — Browser Extension Online Recovery from Expired Grace

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`
PR: https://github.com/ysa-py/V2RayEZ/pull/1

## Goal

Fix a browser-extension recovery edge case introduced by stricter signed grace handling: an expired cached grace token must not prevent a configured online validation attempt. Only true hard-cutoff conditions should block preflight before the server can renew grace.

## Changes Applied

- Updated Chrome and Firefox extension `isHardCachedDenial` logic:
  - remains hard-fail for `license_expired`.
  - remains hard-fail for `server_time_rollback_detected`.
  - no longer treats `offline_grace_expired` as a preflight hard stop when online validation is configured.
- Updated `tools/runtime_license_watchdog_gate.mjs` to assert the corrected hard-denial list.

## Why This Matters

`offline_grace_expired` means the extension cannot use the cached grace token while offline. It should still be able to contact the dashboard and receive a fresh signed grace token if the serial/license itself is still valid. Blocking online validation at preflight would unnecessarily cut off valid users.

## Validation Run

```bash
npm run lint --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
node tools/runtime_license_watchdog_gate.mjs
git diff --check
```

Result: PASS.

## Scope Note

This keeps browser-extension license behavior fail-closed for real expiry/rollback while preserving recovery for stale grace metadata. Real browser runtime validation is still pending.
