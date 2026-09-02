# Milestone 27 Report — Dashboard AI Gateway V2RayEZ Identity Cleanup

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Apply the user's correction one more layer deeper in the dashboard AI Provider Gateway: AetherGUI/Aethon must not be the product UI/UX identity. Donor capabilities remain preserved as internal networking/adaptation capabilities, but the dashboard-facing AI gateway defaults and fallback identity must be V2RayEZ.

## Changes Applied

- Updated dashboard AI Provider Gateway panel defaults:
  - Provider ID: `local-v2rayez`
  - Base URL: `local://v2rayez`
  - Local model: `v2rayez-anti-dpi-local`
  - Fallback mode: `local-v2rayez-ai`
- Updated dashboard fallback descriptor in `ai-provider-gateway.mjs` from donor/MICAFP naming to `local-v2rayez-ai`.
- Updated AI Provider Gateway self-test to assert the V2RayEZ local fallback mode.
- Kept no-code external providers intact: OpenAI-compatible, Anthropic, Gemini, Generic HTTP, custom headers, templates, response-path detection, secret redaction, and local fallback.

## Validation Run

```bash
node --check MICAFP/dashboard/src/lib/ai-provider-gateway.mjs
node --check tools/ai_provider_gateway_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
python3 - <<'PY'
from pathlib import Path
required = {
'MICAFP/dashboard/src/components/ai-provider-gateway-panel.tsx':['local-v2rayez', 'local://v2rayez', 'v2rayez-anti-dpi-local', 'local-v2rayez-ai'],
'MICAFP/dashboard/src/lib/ai-provider-gateway.mjs':['local-v2rayez-ai'],
'tools/ai_provider_gateway_selftest.mjs':['local-v2rayez-ai'],
}
for path, needles in required.items():
    text = Path(path).read_text()
    for needle in needles:
        assert needle in text, f'{path}: {needle}'
    for old in ['local-aether', 'local://aether', 'aether-anti-dpi-local', 'local-micafp-ai']:
        assert old not in text, f'{path}: stale {old}'
print('dashboard AI V2RayEZ identity static checks pass')
PY
npm install --prefix MICAFP/dashboard
npm run lint --prefix MICAFP/dashboard
npm run build --prefix MICAFP/dashboard
git diff --check
```

Result: PASS.

Observed:

- `ai_provider_gateway_selftest: PASS`.
- Dashboard lint passed after local dependency installation.
- Dashboard production build passed and included the AI provider test route.
- `npm install --prefix MICAFP/dashboard` again reported 9 dependency vulnerabilities (4 moderate, 5 high).
- Generated untracked `MICAFP/dashboard/package-lock.json` was removed and not committed.

## Still Pending

- Live provider testing against real external APIs.
- Local AI model/runtime packaging validation on each target platform.
- Full dashboard runtime E2E with database credentials and deployed license/AI settings.
