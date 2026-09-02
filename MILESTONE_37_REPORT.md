# Milestone 37 Report — Dashboard Client Server-Time Rollback Guard

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Harden the dashboard `/api/licenses/validate` path against client-reported server-time rollback cases. Clients already send `clientLastServerTime`; the server should reject impossible future last-seen server times instead of minting a fresh grace token from a potentially rolled-back validation server.

## Changes Applied

- Updated `MICAFP/dashboard/src/lib/license-service.ts`:
  - trims and parses `clientLastServerTime` when supplied.
  - rejects invalid values with `invalid_client_last_server_time`.
  - rejects client last-seen server times more than five minutes ahead of the current validation server with `server_time_rollback_detected`.
  - runs the guard inside the existing validation `try/finally` path so validation attempts continue to be audit-recorded.
- Updated `tools/license_serial_e2e_selftest.mjs`:
  - in-memory E2E validation model now accepts `clientLastServerTime`.
  - added denial assertions for invalid client server time and future/rollback server time.

## Validation Run

```bash
node --check tools/license_serial_e2e_selftest.mjs
node tools/license_serial_e2e_selftest.mjs
node --check tools/license_crypto_selftest.mjs
node tools/license_crypto_selftest.mjs
npm install --prefix MICAFP/dashboard
npm run lint --prefix MICAFP/dashboard
npm run build --prefix MICAFP/dashboard
git diff --check
```

Result: PASS.

## Notes

- `npm install --prefix MICAFP/dashboard` was needed because local dashboard dependencies were not present after workspace reset. It reported the same 9 vulnerabilities as earlier; no audit fix was run.
- The generated untracked `MICAFP/dashboard/package-lock.json` was removed and not committed because this repository already tracks the workspace/root lockfile, not a dashboard-local lockfile.

## Scope Note

This milestone strengthens the dashboard validation path and deterministic E2E self-test. Real multi-node clock-skew validation and deployed API traffic remain pending on a real deployment environment.
