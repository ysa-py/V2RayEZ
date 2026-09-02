# Milestone 42 Report — AI Provider Type Template Alignment

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Close a no-code dashboard AI Gateway mismatch where the UI sends provider family as `providerType`/`type`, but default request-template selection only looked at older `provider`/`shape` fields.

## Changes Applied

- `MICAFP/dashboard/src/lib/ai-provider-gateway.mjs`
  - provider type normalization now accepts `providerType`.
  - default request templates now use `type`/`providerType` before legacy `provider`/`shape`.
- `tools/ai_provider_gateway_selftest.mjs`
  - added a Gemini `providerType` assertion verifying UI-style provider configs generate the Gemini request body.

## Validation Run

```bash
node --check MICAFP/dashboard/src/lib/ai-provider-gateway.mjs
node --check tools/ai_provider_gateway_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
npm run lint --prefix MICAFP/dashboard
git diff --check
```

Result: PASS.

## Scope Note

This is dashboard AI Gateway request-construction hardening. Real external provider calls still require live API credentials/network availability.
