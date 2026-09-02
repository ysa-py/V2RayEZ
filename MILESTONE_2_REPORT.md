# V2RayEZ Universal — Milestone 2 Android Wiring Report

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Scope completed in this milestone

This milestone adds Android-side wiring for the two user-requested control-plane requirements while preserving V2RayEZ as the base application and keeping the existing Compose settings-card style.

### 1. Android License / Serial mode

Added:

- `app/src/main/java/com/v2rayez/app/data/security/SecureStringStore.kt`
  - Android Keystore-backed AES-GCM encrypted string storage.
  - Used for signed serials/license tokens, offline grace tokens, and AI provider API keys.
- `app/src/main/java/com/v2rayez/app/data/license/AndroidLicenseRepository.kt`
  - Verifies compact Ed25519 signed serial tokens with BouncyCastle.
  - Enforces account binding from the signed payload.
  - Enforces expiry locally.
  - Validates online against `/api/licenses/validate` when a validation URL is configured.
  - Stores signed offline grace tokens and verifies grace expiry/device binding.
- `AppSettings.license` / `LicenseConfig` in `ConfigModels.kt`.
- `Settings → License` screen:
  - serial activation
  - account ID
  - validation server URL
  - device label
  - offline grace toggle
  - validate now
  - redacted stored-serial status
- `V2RayVpnService` license enforcement:
  - calls the license repository before tunnel startup paths proceed.
  - normal server tunnel, Tor full-device tunnel, MITM capture-all tunnel, standalone process-core paths, and the standalone MITM local proxy are gated before core startup.
  - starts active-session license watchdogs and hard-stops the VPN or standalone MITM proxy when validation/expiry/grace fails.
- Milestone 3 follow-up: `RealVpnController.kt` now preflights `connect(server)` and `toggle()` through `AndroidLicenseRepository.enforce()` before `startForegroundService`, avoiding doomed foreground-service starts when the serial is missing/expired/revoked.

Build-time properties added in `app/build.gradle.kts`:

- `v2rayez.license.validationUrl`
- `v2rayez.license.publicKeyPem`
- `v2rayez.license.publicKeysJson`
- `v2rayez.license.deviceHashSalt`

### 2. Android AI Engine / no-code provider gateway

Added:

- `AppSettings.aiEngine`, `AiEngineConfig`, `AiProviderConfig`, `AiProviderType`.
- `app/src/main/java/com/v2rayez/app/data/ai/AndroidAiProviderGateway.kt`
  - Executes configured external AI providers.
  - Supports OpenAI-compatible, Anthropic, Gemini, generic HTTP, and local fallback definitions.
  - Reads API secrets by alias from Android-Keystore-backed secure storage.
  - Supports header JSON, request template, response path, and model without code changes.
  - Redacts secrets in errors.
  - Falls back to the local V2RayEZ/Aether anti-DPI policy if external APIs are blocked/unreachable.
- `Settings → AI Engine` screen:
  - enable/disable AI Engine
  - enable/disable automatic local fallback
  - select/test/edit/delete providers
  - add provider without code changes
- `V2RayVpnService` now invokes the AI advisor asynchronously after failed connectivity probes so an external AI timeout cannot block a usable tunnel.

### 3. Navigation and localization

Added routes:

- `Routes.LICENSE`
- `Routes.AI_ENGINE`

Wired in:

- `SettingsScreen.kt`
- `V2RayApp.kt`

Localization added for EN/FA/RU and parity gate passed.

## Validation performed locally

### String parity gate

```bash
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh"
```

Result:

```text
GATE_STATUS=PASS
base (values/strings.xml): 1017 keys
values-fa: 1017 keys
values-ru: 1017 keys
```

### Android string XML parse

```bash
python3 - <<'PY'
from xml.etree import ElementTree as ET
from pathlib import Path
for p in Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res').glob('values*/strings.xml'):
    ET.parse(p)
print('xml_strings_parse: PASS')
PY
```

Result: `xml_strings_parse: PASS`.

### Existing Node self-tests

```bash
node tools/license_crypto_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
```

Result:

```text
license_crypto_selftest: PASS
ai_provider_gateway_selftest: PASS
```

### UAC Windows Python syntax regression

```bash
python3 -m compileall -q "UAC-SNI-Spoofer-Windows- Make sure to fully add all features to the V2RayEZ app/uac_desktop"
```

Result: pass. Generated `__pycache__` directories were removed afterward.

## Validation still blocked in this sandbox

Android Gradle remains blocked because Java is absent:

```bash
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/gradlew" --version
```

Result:

```text
ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
```

Therefore no APK build, Compose compile, Hilt compile, Android instrumentation, or real Android tunnel/connectivity validation has been completed locally in this milestone.

Existing non-Android blockers also remain: Rust/Cargo missing, Go missing, macOS/Xcode unavailable, Windows toolchain unavailable, OpenWrt SDK unavailable, and no real transport endpoints/devices are available for final E2E connectivity verification.

## Files changed/added in Milestone 2

Key Android files:

- `app/build.gradle.kts`
- `app/src/main/java/com/v2rayez/app/domain/model/ConfigModels.kt`
- `app/src/main/java/com/v2rayez/app/data/security/SecureStringStore.kt`
- `app/src/main/java/com/v2rayez/app/data/license/AndroidLicenseRepository.kt`
- `app/src/main/java/com/v2rayez/app/data/ai/AndroidAiProviderGateway.kt`
- `app/src/main/java/com/v2rayez/app/ui/viewmodel/LicenseAiViewModels.kt`
- `app/src/main/java/com/v2rayez/app/ui/screens/settings/LicenseScreen.kt`
- `app/src/main/java/com/v2rayez/app/ui/screens/settings/AiEngineScreen.kt`
- `app/src/main/java/com/v2rayez/app/ui/screens/settings/SettingsScreen.kt`
- `app/src/main/java/com/v2rayez/app/ui/navigation/Routes.kt`
- `app/src/main/java/com/v2rayez/app/ui/V2RayApp.kt`
- `app/src/main/res/values*/strings.xml`
- `app/src/main/java/com/v2rayez/app/data/service/V2RayVpnService.kt`
- `app/src/main/java/com/v2rayez/app/data/service/MitmProxyService.kt`
- `app/src/main/java/com/v2rayez/app/data/repository/RealVpnController.kt`

Docs/traceability updated:

- `docs/LICENSE_API.md`
- `docs/AI_PROVIDER_GATEWAY.md`
- `FEATURE_MATRIX.md`
- `MERGE_TRACEABILITY.md`
- `UI_CHANGELOG.md`
- `TEST_EVIDENCE.md`

## Next recommended milestone

1. Run Android build in a Java 17 + Android SDK environment and fix any compile/Hilt/resource issues.
2. Add JVM/Robolectric tests for `AndroidLicenseRepository` token verification and grace expiry.
3. Add Android navigation/screenshot tests for Settings, License, and AI Engine screens.
4. Wire the same license gate and AI provider settings into iOS, Windows, Linux, and OpenWrt shells.
5. Continue transport merge work only after each platform build gate can run, and do not mark any transport complete until real traffic evidence exists.
