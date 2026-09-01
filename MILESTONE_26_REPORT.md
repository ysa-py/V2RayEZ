# Milestone 26 Report — Dashboard License Validation Hardening

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Strengthen the dashboard license server so issued/validated serials have tighter anti-forgery and consistency checks before client platforms receive an allow/grace decision.

## Changes Applied

- Hardened issue-time inputs in `MICAFP/dashboard/src/lib/license-service.ts`:
  - `maxDevices` must be an integer between `1` and `10000`.
  - `offlineGraceHours` must be an integer between `0` and `720`.
  - `accountId` is trimmed and falls back to the user id when omitted.
- Hardened validation-time inputs:
  - `licenseKey`, `deviceId`, `accountId`, and `platform` are required and normalized before hashing/comparison.
  - Validation hashes use the trimmed serial and device id.
- Added signed-payload/database consistency checks:
  - Payload status must be `ACTIVE`.
  - Future or invalid `notBefore` values are rejected.
  - Payload expiry, `maxDevices`, and `offlineGraceHours` must match the database record.
  - Existing license id/user id/account checks remain enforced.
- Preserved existing behavior for:
  - Revoked/expired user/license/device denial.
  - Device-count enforcement.
  - Signed offline grace token generation.
  - Audit logging with redacted serial values only.

## Validation Run

```bash
npm install --prefix MICAFP/dashboard
npm run lint --prefix MICAFP/dashboard
node --check MICAFP/dashboard/src/lib/license-crypto.mjs
node --check tools/license_crypto_selftest.mjs
node tools/license_crypto_selftest.mjs
python3 - <<'PY'
from pathlib import Path
text = Path('MICAFP/dashboard/src/lib/license-service.ts').read_text()
for needle in ['boundedInteger', 'payload_not_active', 'license_not_yet_valid', 'payload_database_mismatch', 'const licenseKey = input.licenseKey.trim()', 'const accountId = input.accountId.trim()']:
    assert needle in text, needle
print('dashboard license service hardening static checks pass')
PY
git diff --check
npm run build --prefix MICAFP/dashboard
```

Result: PASS.

- Dashboard dependencies were installed locally for validation.
- `npm run lint --prefix MICAFP/dashboard` passed.
- License crypto syntax and self-test passed.
- Static hardening assertions passed.
- `npm run build --prefix MICAFP/dashboard` passed and included `/api/licenses/issue`, `/api/licenses/validate`, `/api/licenses/renew`, `/api/licenses/revoke`, and `/api/users/[id]/licenses` routes.

Observed warning:

- `npm install --prefix MICAFP/dashboard` reported 9 dependency vulnerabilities (4 moderate, 5 high), unchanged from earlier dashboard dependency-install observations.

Not committed:

- The generated `MICAFP/dashboard/package-lock.json` from the local validation install was removed because the project did not track it before and it was not part of this code change.

## Still Pending

- Runtime validation against a real `DATABASE_URL` and Prisma-generated client/database.
- Dashboard license E2E with real signed clients across desktop/mobile/OpenWrt/extensions.
