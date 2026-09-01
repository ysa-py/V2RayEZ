# Milestone 30 Report — Canonical V2RayEZ AI Identity Defaults

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Continue enforcing the user's correction across AI Engine surfaces: the product/UI identity must be V2RayEZ. Donor AI/networking capability names can remain only where needed for migration, internal adapter compatibility, or provenance; active defaults and user-facing fallback wording must be V2RayEZ.

## Changes Applied

- Updated shared Rust AI Provider fallback descriptor:
  - `local-micafp-ai` → `local-v2rayez-ai`.
- Updated dashboard provider-test error fallback:
  - catch-path fallback mode now reports `local-v2rayez-ai`.
- Updated OpenWrt/LuCI AI defaults:
  - selected provider: `local-v2rayez`
  - default provider section: `local_v2rayez`
  - local URL: `local://v2rayez`
  - local model/policy: `v2rayez-anti-dpi-local`
- Added OpenWrt Lua legacy compatibility mapping so already-installed `local-aether` / `local_aether` configs resolve to the canonical V2RayEZ local provider rather than surfacing old defaults.
- Updated the core Android application AI defaults:
  - default selected provider, local provider ID, local URL, local model, and fallback provider ID now use V2RayEZ identity.
  - retained compatibility handling for legacy `local-aether` provider IDs so existing stored settings keep working without user action.
- Updated Android EN/FA/RU AI fallback strings so the visible setting says internal V2RayEZ policy, not V2RayEZ/Aether policy.
- Updated AI Provider Gateway documentation and traceability text to describe local V2RayEZ fallback while preserving donor-adapter traceability.

## Validation Run

```bash
npm test --prefix V2RayEZ-GUI
node --check tools/v2rayez_identity_gate.mjs
node tools/v2rayez_identity_gate.mjs
node --check tools/ai_provider_gateway_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
npm run lint --prefix MICAFP/dashboard
npm run build --prefix MICAFP/dashboard
python3 - <<'PY'
import xml.etree.ElementTree as ET
for path in [
'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res/values/strings.xml',
'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res/values-fa/strings.xml',
'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res/values-ru/strings.xml',
]:
    ET.parse(path)
print('base Android AI string XML parse pass')
PY
python3 - <<'PY'
from pathlib import Path
active_paths = [
    Path('MICAFP/dashboard/src/app/api/ai-engine/providers/test/route.ts'),
    Path('universal-core/src/ai_provider.rs'),
    Path('docs/AI_PROVIDER_GATEWAY.md'),
    Path('MICAFP/openwrt/files/etc/config/unifiedshield'),
    Path('MICAFP/openwrt/files/usr/libexec/unifiedshield/ai-provider-test.lua'),
    Path('MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/controller/unifiedshield.lua'),
    Path('MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua'),
    Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/data/ai/AndroidAiProviderGateway.kt'),
    Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/domain/model/ConfigModels.kt'),
    Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/ui/screens/settings/AiEngineScreen.kt'),
    Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/ui/viewmodel/LicenseAiViewModels.kt'),
    Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res/values/strings.xml'),
    Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res/values-fa/strings.xml'),
    Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res/values-ru/strings.xml'),
]
joined = '\n'.join(f'--- {p}\n{p.read_text()}' for p in active_paths)
for required in ['local-v2rayez', 'local://v2rayez', 'v2rayez-anti-dpi-local', 'local-v2rayez-ai', 'internal V2RayEZ policy', 'سیاست داخلی V2RayEZ', 'внутреннюю политику V2RayEZ']:
    assert required in joined, required
for forbidden in ['local-micafp-ai', 'local://aether', 'aether-anti-dpi-local', 'V2RayEZ/Aether', 'Aether startup']:
    hits = [str(p) for p in active_paths if forbidden in p.read_text()]
    assert not hits, (forbidden, hits)
print('ai_identity_static: PASS')
PY
git diff --check
```

Result: PASS.

## Scope Note

This milestone changes active defaults and user-visible AI fallback wording only. Legacy `local-aether` handling remains intentionally present in compatibility/migration paths so existing installations do not lose stored provider settings.

## Still Blocked Locally

- Rust/Cargo, Android Gradle toolchain, iOS/Xcode, OpenWrt SDK/Lua runtime, and real device/router/network tests remain unavailable in this sandbox, so native compilation and real connectivity validation still need proper toolchains/hardware.
