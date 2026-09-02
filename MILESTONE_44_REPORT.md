# Milestone 44 Report — Browser Extension License Server-Time Propagation

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Bring Chrome/Firefox extension license validation in line with the dashboard server-time rollback guard and the native/mobile clients by preserving and sending the last trusted validation server time.

## Changes Applied

- `MICAFP/extensions/shared/protocol.ts`
  - added `licenseLastServerTime` and `licenseGraceServerTime` config fields with V2RayEZ defaults.
- Chrome MV3 service worker:
  - sends `clientLastServerTime` during dashboard validation.
  - stores successful dashboard `serverTime` as both last trusted server time and current grace server time.
  - denies cached-grace use with `server_time_rollback_detected` if grace metadata is older than the last trusted server time beyond the five-minute rollback window.
- Firefox background worker:
  - mirrors the Chrome behavior for validation payloads, trusted server-time storage, and rollback denial.
- Chrome/Firefox options UIs:
  - display a read-only `Last trusted server time` line in the License section.
- `tools/runtime_license_watchdog_gate.mjs`
  - now asserts browser-extension server-time fields, validation payload propagation, rollback denial, and options UI observability.

## Validation Run

```bash
npm install --prefix MICAFP/extensions/chrome
npm install --prefix MICAFP/extensions/firefox
npm run lint --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
node tools/runtime_license_watchdog_gate.mjs
node tools/v2rayez_identity_gate.mjs
git diff --check
```

Result: PASS.

## Notes

- `npm install` was required only to restore local TypeScript tooling for validation. Both extension installs reported zero vulnerabilities.
- Generated untracked extension package lock files were removed because the repository does not track per-extension lockfiles.

## Scope Note

This improves browser-extension source/type validation and runtime metadata propagation. It does not replace real browser packaging/signing or live extension-store/device validation.
