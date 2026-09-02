# Milestone 31 Report — Signed Serial End-to-End Self-Test Gate

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Advance the license/serial requirement from isolated crypto checks toward a repeatable end-to-end gate that exercises the full signed-serial lifecycle available in this sandbox: issue, validate, bind to one user/account/device, mint offline grace, enforce hard cutoff, and reject forgery/mismatch cases.

## Changes Applied

- Added `tools/license_serial_e2e_selftest.mjs`.
- The self-test uses the same dashboard license crypto primitives as production:
  - Ed25519 license signing/verification.
  - V2RayEZ license token type.
  - V2RayEZ grace-token type.
  - salted device hashing.
  - license-key hashing.
  - expiry/remaining-time calculation.
- The test models an in-memory dashboard validation path and verifies:
  - signed serial issuance.
  - successful online validation for the licensed account/device.
  - signed offline grace-token issuance.
  - offline start allowed before cutoff.
  - hard cutoff equal to the earlier of license expiry and grace expiry.
  - repeat validation reuses the same device activation.
  - second-device denial when `maxDevices` is reached.
  - account mismatch denial.
  - tampered serial/signature denial.
  - expired-license denial.
  - grace-token device mismatch denial.
  - grace-token platform mismatch denial.
  - offline-grace expiry denial.
  - server-time rollback denial.
  - revoked-license denial.
- Updated `docs/ci/github-workflows/universal-source-gates.yml.sample` so the future CI source gate runs:
  - `node tools/license_crypto_selftest.mjs`
  - `node tools/license_serial_e2e_selftest.mjs`
  - `node tools/ai_provider_gateway_selftest.mjs`

## Validation Run

```bash
node --check tools/license_crypto_selftest.mjs
node tools/license_crypto_selftest.mjs
node --check tools/license_serial_e2e_selftest.mjs
node tools/license_serial_e2e_selftest.mjs
node --check tools/ai_provider_gateway_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
python3 - <<'PY'
from pathlib import Path
text = Path('docs/ci/github-workflows/universal-source-gates.yml.sample').read_text()
assert 'node tools/license_serial_e2e_selftest.mjs' in text
assert text.index('node tools/license_crypto_selftest.mjs') < text.index('node tools/license_serial_e2e_selftest.mjs') < text.index('node tools/ai_provider_gateway_selftest.mjs')
assert '\t' not in text
print('license e2e workflow template check pass')
PY
git diff --check
```

Result: PASS.

## Scope Note

This is a deterministic local E2E self-test gate for the signed-serial logic. It does not replace the still-required real deployed dashboard/API/native-device validation, because this sandbox still lacks the required device/router/toolchain credentials and hardware.
