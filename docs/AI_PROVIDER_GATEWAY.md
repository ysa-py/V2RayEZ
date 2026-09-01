# V2RayEZ Universal AI Provider Gateway

**Status:** Milestone 1 initial implementation.  
**Implementation:** `MICAFP/dashboard/src/lib/ai-provider-gateway.mjs` and `POST /api/ai-engine/providers/test`.

The AI Provider Gateway lets V2RayEZ add new external AI/LLM providers and models by JSON/form configuration, without source-code changes. External AI is optional. If it is blocked, unreachable, rate-limited, or disabled, the product falls back to the local MICAFP AI stack.

---

## Design rules

- External AI never gates core VPN/anti-DPI behavior.
- API keys are stored through platform secret stores and are never sent to telemetry.
- Exported provider configs must redact secrets.
- The gateway supports OpenAI-style, Anthropic-style, Gemini-style, and generic REST JSON response shapes.
- Provider reachability is tested by a real HTTP request with timeout and error categorization.
- If the endpoint is blocked/unreachable, callers receive a local fallback descriptor pointing to the internal AI engines.

Local fallback engines:

- `dpi_classifier`
- `adversarial_traffic`
- `feature_extractor`
- `onnx_runtime`
- `rl_transport_selector`
- `traffic_predictor`
- `ucb_bandit`

---

## Provider JSON schema

Example OpenAI-compatible provider:

```json
{
  "id": "openai-compatible",
  "displayName": "OpenAI Compatible",
  "baseUrl": "https://api.example.com",
  "endpointPath": "/v1/chat/completions",
  "method": "POST",
  "model": "new-model-name",
  "timeoutMs": 12000,
  "auth": {
    "type": "bearer",
    "headerName": "Authorization",
    "headerTemplate": "Bearer ${apiKey}",
    "secretRef": "platform-secret-id"
  },
  "schema": {
    "requestTemplate": {
      "model": "${model}",
      "messages": [
        { "role": "system", "content": "${system}" },
        { "role": "user", "content": "${prompt}" }
      ],
      "temperature": 0.2
    },
    "responsePath": "choices[0].message.content"
  },
  "proxyPolicy": "try-active-tunnel-then-direct",
  "censorshipProbe": {
    "enabled": true,
    "testPrompt": "Reply with the single word OK."
  }
}
```

Example Gemini-style provider:

```json
{
  "id": "gemini-rest",
  "displayName": "Gemini REST",
  "baseUrl": "https://generativelanguage.googleapis.com",
  "endpointPath": "/v1beta/models/${model}:generateContent",
  "method": "POST",
  "model": "gemini-2.5-pro",
  "auth": {
    "type": "api-key",
    "headerName": "x-goog-api-key",
    "headerTemplate": "${apiKey}",
    "secretRef": "gemini-api-key"
  },
  "schema": {
    "requestTemplate": {
      "contents": [
        { "parts": [{ "text": "${prompt}" }] }
      ],
      "generationConfig": { "maxOutputTokens": 512 }
    },
    "responsePath": "candidates[0].content.parts[0].text"
  }
}
```

Endpoint path templates and request body templates both support `${model}`, `${prompt}`, and `${system}` substitution.

---

## Test & Auto-detect endpoint

`POST /api/ai-engine/providers/test`

Request:

```json
{
  "provider": {
    "baseUrl": "https://api.example.com",
    "endpointPath": "/v1/chat/completions",
    "method": "POST",
    "model": "model-name",
    "auth": {
      "type": "bearer",
      "headerName": "Authorization",
      "headerTemplate": "Bearer ${apiKey}"
    }
  },
  "apiKey": "runtime-secret-only",
  "prompt": "Reply OK."
}
```

Success response:

```json
{
  "success": true,
  "autoDetect": {
    "success": true,
    "reachable": true,
    "blocked": false,
    "status": 200,
    "latencyMs": 123,
    "detectedShape": "openai",
    "responsePath": "choices[0].message.content",
    "sampleText": "OK",
    "provider": { "auth": { "secret": "sk-abc…wxyz" } },
    "fallback": null
  },
  "localFallback": null
}
```

Blocked/unreachable response:

```json
{
  "success": false,
  "autoDetect": {
    "success": false,
    "reachable": false,
    "blocked": true,
    "retryable": true,
    "errorCode": "network_unreachable",
    "fallback": {
      "mode": "local-v2rayez-ai",
      "reason": "network_unreachable",
      "dependencyFreeCoreNetworking": true
    }
  },
  "localFallback": {
    "mode": "local-v2rayez-ai",
    "reason": "network_unreachable",
    "dependencyFreeCoreNetworking": true
  }
}
```

---

## Auto-detected response shapes

| Shape | Extracted path |
|---|---|
| OpenAI chat | `choices[0].message.content` |
| OpenAI legacy completion | `choices[0].text` |
| Anthropic messages | `content[0].text` |
| Gemini REST | `candidates[0].content.parts[0].text` |
| Generic REST | `text`, `message`, `content`, `result`, `output`, `data.text`, `data.message`, or configured `responsePath` |

---

## Platform secure storage requirements

Final platform wiring must store secrets in:

- Android: Android Keystore with encrypted DataStore.
- iOS: Keychain.
- Windows: DPAPI / Windows Credential Manager.
- Linux: Secret Service/libsecret, with encrypted local fallback if unavailable.
- OpenWrt: root-owned protected file/UCI state with `0600` permissions and no LuCI echo of secrets.

---

## Tests currently added

```bash
node tools/ai_provider_gateway_selftest.mjs
```

Validated behaviors:

- Builds provider request from JSON template.
- Detects OpenAI, Anthropic, Gemini, and generic REST response shapes.
- Redacts auth secrets.
- Returns local MICAFP AI fallback descriptor.

---

## Android Milestone 2 wiring

The Android base app now includes the first platform UI/client for the no-code AI Provider Gateway:

- `AppSettings.aiEngine` persists provider definitions, selected provider, local model name, fallback policy, and last test result.
- API keys/secrets are stored by alias in Android-Keystore-backed encrypted preferences, not in DataStore/backups.
- `Settings → AI Engine` lets users add/edit OpenAI-compatible, Anthropic, Gemini, generic HTTP, or local fallback providers without code changes. Each provider can define base URL, endpoint path, method family, model, header JSON, request template, response path, and API key alias.
- `AndroidAiProviderGateway` executes configured providers, redacts secrets from errors, auto-detects common response shapes, and returns the local V2RayEZ anti-DPI fallback when external APIs are blocked or unreachable.
- `V2RayVpnService` invokes the AI advisor asynchronously when connectivity probes fail, so external API timeouts cannot block an otherwise usable tunnel. The advisor logs the selected external/local recommendation for follow-up adaptive routing work.

---

## Desktop/Tauri Milestone 3 wiring

The V2RayEZ desktop/Tauri GUI now has matching no-code AI Provider Gateway wiring. The legacy Aether GUI donor is not the final GUI; Aether remains only an engine adapter:

- `src-tauri/src/settings.rs` persists `aiEngine` provider definitions for local, OpenAI-compatible, Anthropic, Gemini, and generic HTTP providers. Settings validation rejects malformed provider IDs, bad URL syntax, invalid header JSON, and unsafe timeout values.
- Settings UI includes provider ID/name/type/base URL/endpoint/model/API-key alias/header JSON/request template/response path fields so new providers can be added without code changes.
- `src-tauri/src/ai_provider.rs` stores API secrets separately by alias through `src-tauri/src/secure_store.rs`, builds provider requests from either known provider families or the configured JSON template, extracts common response paths, redacts secrets from errors, and returns local V2RayEZ anti-DPI guidance when external APIs are blocked/unreachable.
- `src-tauri/src/secure_store.rs` encrypts secrets with Windows DPAPI on Windows and uses `0600` protected app-config files on Unix-like desktop targets until the Linux libsecret/keyring backend is added.
- `connect()` logs non-blocking AI advisor output after V2RayEZ core startup/probe failure; AI failures do not block an otherwise valid tunnel.

Desktop build note: this wiring passed frontend/static tests, but the Rust command layer has not been compiled because the sandbox lacks a Rust toolchain.

---

## OpenWrt LuCI Milestone 4 wiring

The MICAFP/OpenWrt package path now has additive AI Engine Gateway settings:

- `/etc/config/unifiedshield` includes AI Engine toggles, selected provider ID, local fallback model, and a default `ai_provider` section for `local-v2rayez`.
- LuCI CBI model `src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua` lets router admins add OpenAI-compatible, Anthropic, Gemini, generic HTTP, or local providers without code changes.
- Provider API keys are referenced by alias files under `/etc/unifiedshield/ai-secrets/<alias>.secret`; LuCI stores aliases only and does not echo secrets.
- `/usr/libexec/unifiedshield/ai-provider-test.lua` tests the selected provider through `curl`, `uclient-fetch`, or `wget`, redacts secrets, and falls back to local V2RayEZ anti-DPI guidance when external APIs are blocked/unreachable.

OpenWrt build note: Lua syntax/runtime and router network tests are still pending because the sandbox lacks LuCI/Lua/OpenWrt SDK runtime.

---

## iOS Milestone 5 wiring

The MICAFP iOS/UnifiedShield path now has matching first-pass AI Provider Gateway wiring:

- `App/AIProviderGateway.swift` persists no-code provider definitions in preferences and stores API secrets in Keychain by alias.
- `App/SettingsView.swift` exposes AI Engine controls for provider ID/name/type/base URL/endpoint/model/API-key alias/secret/header JSON/request template/response path, plus save/test actions.
- `NetworkExtension/TunnelManager.swift` and `PacketTunnelProvider.swift` call non-blocking local AI advisor paths after startup/core failures.
- `NetworkExtension/ExtensionAIAdvisor.swift` provides deterministic local fallback guidance inside the extension without blocking tunnel lifecycle on external APIs.

Production note: final iOS validation must confirm Keychain sharing, external API behavior through the active tunnel, local fallback when APIs are blocked, and Network Extension entitlement correctness on a real device.

---

## Dashboard Milestone 6 admin UI wiring

The MICAFP Next.js dashboard now has an additive AI Provider Gateway panel:

- `src/components/ai-provider-gateway-panel.tsx` lets operators define/test OpenAI-compatible, Anthropic, Gemini, generic HTTP, and local providers without code changes.
- `src/app/page.tsx` adds an `ai-gateway` tab alongside the existing AI orchestration tab, preserving all original dashboard modules.
- The panel calls `/api/ai-engine/providers/test` for provider auto-detection and presents local fallback status when external APIs are blocked/unreachable.

Validation note: dashboard lint/build are blocked locally because dependencies are not installed (`eslint: not found`). The pure MJS gateway self-test remains the local source of evidence until Next/Prisma tooling is installed.
