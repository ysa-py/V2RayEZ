# Milestone 41 Report — Dashboard AI Provider Local/No-Code Request Hardening

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Fix dashboard AI Provider Gateway edge cases so the no-code provider panel can test both local V2RayEZ fallback providers and UI-authored external provider templates reliably.

## Changes Applied

- `MICAFP/dashboard/src/lib/ai-provider-gateway.mjs`
  - local providers now accept `local://v2rayez` and `type: local` without requiring an HTTP URL.
  - local provider tests return an immediate successful V2RayEZ Local AI result and do not call `fetch`.
  - external providers now accept UI field name `endpoint` in addition to `endpointPath`/`path`.
  - `headersJson` from the no-code panel is parsed and merged into outbound headers.
  - JSON request templates authored as strings are rendered and sent as raw JSON rather than JSON-encoded strings.
  - template variables now include `prompt_json` and `system_json` for safe no-code JSON templates.
  - invalid `headersJson` fails clearly with `invalid_headers_json`.
- `MICAFP/dashboard/src/lib/ai-provider-gateway.d.ts`
  - exports the new local provider result helper for tests/typed imports.
- `tools/ai_provider_gateway_selftest.mjs`
  - added coverage for UI-style `endpoint`, `headersJson`, JSON string request templates, invalid JSON failure, and local provider no-fetch behavior.

## Validation Run

```bash
node --check MICAFP/dashboard/src/lib/ai-provider-gateway.mjs
node --check tools/ai_provider_gateway_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
node tools/v2rayez_identity_gate.mjs
npm run lint --prefix MICAFP/dashboard
npm run build --prefix MICAFP/dashboard
git diff --check
```

Result: PASS.

## Scope Note

This milestone validates gateway request construction and local fallback behavior with an in-process HTTP probe. Real external provider calls still require live API credentials/network access and are intentionally not executed in this sandbox.
