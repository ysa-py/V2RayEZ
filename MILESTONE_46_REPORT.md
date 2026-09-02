# Milestone 46 Report — Browser Extension Grace Recovery Policy

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Avoid blocking online revalidation because of recoverable cached-grace configuration problems, while still failing closed immediately for hard cutoff conditions.

## Changes Applied

- Chrome and Firefox extension license gates now distinguish hard cached-grace denials from recoverable cache/configuration denials during preflight.
- Hard cached denials still stop immediately:
  - `license_expired`
  - `offline_grace_expired`
  - `server_time_rollback_detected`
- Recoverable cache errors, such as missing public key or invalid cached grace signature, no longer prevent an online validation attempt when a validation URL is configured.
- `tools/runtime_license_watchdog_gate.mjs` now asserts the `isHardCachedDenial(cached)` guard.

## Validation Run

```bash
npm run lint --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
node tools/runtime_license_watchdog_gate.mjs
git diff --check
```

Result: PASS.

## Scope Note

This only changes browser-extension recovery behavior. Actual browser runtime/device validation remains pending.
