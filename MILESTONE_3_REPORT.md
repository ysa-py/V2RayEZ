# Milestone 3 Report — V2RayEZ Desktop/Tauri License + AI Wiring

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Scope Completed

This milestone extends the Milestone 1/2 license and AI Provider Gateway primitives into the V2RayEZ Windows/Linux Tauri GUI. V2RayEZ-GUI Aether-adapter code is treated only as a donor/source adapter; the shipped GUI/product identity is V2RayEZ.

## Desktop/Tauri Changes

Changed under the imported donor workspace that now carries the V2RayEZ desktop GUI port, `V2RayEZ-GUI/`:

- `src-tauri/src/settings.rs`
  - Added persisted `LicenseSettings`, `AiProviderSettings`, and `AiEngineSettings`.
  - Added defaults for local V2RayEZ/Aether AI fallback.
  - Added validation for license validation URL/account metadata, AI provider IDs/types/base URLs, timeout bounds, and provider header JSON.
  - Confirmed license and AI settings are stored in settings but not forwarded into Aether core environment variables.
- `src-tauri/src/license.rs`
  - Added desktop serial activation/validation/clear logic.
  - Reuses `universal-core` Ed25519 compact token verification.
  - Supports online `/api/licenses/validate`, signed offline grace tokens, per-device ID, expiry hard cutoff, and redacted UI status.
  - Stores activated serial and grace token outside normal settings through the new protected store helper.
- `src-tauri/src/secure_store.rs`
  - Adds shared protected secret/state storage for desktop license and AI secrets.
  - Uses Windows DPAPI on Windows and `0600` protected files on Unix-like desktop targets.
- `src-tauri/src/ai_provider.rs`
  - Added no-code provider test/execution path for local, OpenAI-compatible, Anthropic, Gemini, and generic HTTP providers.
  - Stores API secrets by alias outside settings through the protected store helper.
  - Supports JSON request templates, common response-path extraction, secret redaction, and automatic local fallback when external APIs are blocked/unreachable.
- `src-tauri/src/lib.rs`
  - Added Tauri commands: `activate_license`, `validate_license`, `clear_license`, `test_ai_provider`, and `save_ai_secret`.
  - Enforces license before starting Aether core, Smart Connect trials, MASQUE fallback, or VPN routing.
  - Starts a connected-session license watchdog that stops Aether/routing on expiry/revocation/grace failure.
  - Logs non-blocking AI advisor output after startup/probe failures.
- `src/index.html`, `src/app.js`, `src/i18n.js`, `src/styles.css`
  - Added Settings → License controls.
  - Added Settings → AI Engine controls including provider ID/name/type/base URL/endpoint/model/API-key alias/secret/header JSON/request template/response path.
  - Preserved the V2RayEZ compact mobile-style layout and drawer navigation; Aether remains only an engine adapter.
- `tests/frontend.test.mjs`
  - Added static regression coverage for License/AI UI, EN/FA localization, backend command wiring, and secret-free normal settings.
- `src-tauri/Cargo.toml`
  - Added desktop license dependencies, Windows DPAPI feature flags, and `universal-core` path dependency.
- `src-tauri/tauri.conf.json`
  - Keeps Windows `nsis`/`msi` targets and adds Linux `deb`/`rpm`/`appimage` bundle targets for native Linux packages.

## Android Follow-Up Completed

Changed under the base V2RayEZ Android app:

- `app/src/main/java/com/v2rayez/app/data/repository/RealVpnController.kt`
  - Injects `AndroidLicenseRepository`.
  - `connect(server)` now performs license validation before starting the foreground VPN service.
  - `toggle()` keeps the existing no-server preflight and now uses the same license-gated service starter.
  - Persists latest license result metadata into `AppSettings.license`.
  - Fails closed with `vpn_error_license_required` before starting a doomed foreground service.

The Android service-side gates from Milestone 2 remain in `V2RayVpnService.kt` and `MitmProxyService.kt`, so Android now has both UI/controller preflight and service fail-closed enforcement.

## Validation Run

Desktop/static:

```bash
cd "V2RayEZ-GUI"
node --check src/app.js
node --check src/i18n.js
npm test
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri config json pass')"
```

Result:

- `node --check src/app.js` — PASS.
- `node --check src/i18n.js` — PASS.
- `npm test` — PASS, 14/14 TAP tests.
- `src-tauri/tauri.conf.json` JSON parse — PASS.

Android/local gates:

```bash
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh"
python3 - <<'PY'
import xml.etree.ElementTree as ET
from pathlib import Path
base=Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res')
for path in sorted(base.glob('values*/strings.xml')):
    ET.parse(path)
    print(f'PASS {path}')
PY
git diff --check
```

Result:

- Android EN/FA/RU string parity — PASS, 1017 keys each.
- Android `strings.xml` parse — PASS for `values`, `values-fa`, `values-ru`.
- `git diff --check` — PASS.

Toolchain checks:

```bash
cargo --version
bash gradlew --version
```

Result:

- Rust/Tauri build is BLOCKED: `cargo`/`rustc` are not installed.
- Android Gradle build is BLOCKED: `JAVA_HOME is not set and no 'java' command could be found in your PATH`.

## Remaining Blockers / Pending Validation

- Rust/Tauri code has not been compiled due to missing Rust toolchain.
- Android Kotlin/Hilt/DataStore code has not been compiled due to missing Java/JDK/Android SDK runtime.
- Windows installer/portable `.exe`, Android `.apk`, iOS `.ipa`, OpenWrt `.ipk`, and Linux native packages still require their platform toolchains/runners.
- Real E2E connectivity tests remain pending until target devices, server configs/credentials, transport binaries, and platform runners are available.

## Next Recommended Steps

1. Continue OpenWrt LuCI/UCI license + AI settings wiring using the MICAFP package structure.
2. Add Linux packaging/service integration for the desktop/Tauri path.
3. Continue iOS client/keychain/license/AI planning and implementation once source path/toolchain is confirmed.
4. Run full platform builds and real connectivity tests as soon as toolchains and devices are available.
