# Milestone 47 Report — Browser Extension Grace Token Rotation Safety

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Prevent Chrome/Firefox extensions from reusing a previously signed grace token after the user changes the serial, account, validation URL, or public verification key.

## Changes Applied

- Chrome and Firefox options save handlers now track the previous license config before merging changes.
- When a new serial is pasted:
  - `licenseGraceToken` is removed from secret storage.
  - cached grace timestamps are cleared.
- When the account ID, public key PEM, or validation URL changes:
  - `licenseGraceToken` is removed.
  - cached grace timestamps are cleared.
- `tools/runtime_license_watchdog_gate.mjs` now asserts the grace-token deletion and previous-config checks in both browser extension options pages.

## Validation Run

```bash
npm run lint --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
node tools/runtime_license_watchdog_gate.mjs
git diff --check
```

Result: PASS.

## Scope Note

This is source/type-level browser-extension safety hardening. It still needs real Chrome/Firefox runtime validation with store-signed builds.
