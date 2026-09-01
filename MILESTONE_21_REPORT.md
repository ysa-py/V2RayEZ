# Milestone 21 Report — Android License and AI Provider Settings

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Extend the Android V2RayEZ GUI without redesigning the existing interface so that serial/license mode and no-code AI provider configuration are available on Android too, with secret values hidden from the UI and stored outside normal plaintext preferences.

## Changes Applied

- Added `AndroidSecretStore` using Android Keystore AES-GCM.
  - Stores the signed serial/license token and AI provider API key encrypted.
  - Secret values are replaced by a placeholder after saving and are never rendered back into settings.
  - Clear actions remove individual secrets.
- Added `AndroidLicenseGate`.
  - If serial mode is configured, validation runs before starting the VPN/proxy service.
  - Validates online against `<licenseServerUrl>/api/licenses/validate` with the Android device ID, account ID, app version, platform, and device label.
  - Stores server-confirmed `expiresAt` and `offlineGraceUntil` metadata for local cutoff checks.
  - Fails closed after license expiry or offline grace expiry when serial mode is active.
  - Allows the existing free/unconfigured flow only when no signed serial is installed, preserving existing behavior until serial mode is enabled.
- Extended Android settings UI in `activity_main.xml`.
  - License activation box: signed serial, account ID, validation server URL, save and clear-secret actions, status text.
  - AI Engine/API provider box: provider alias, endpoint URL, model, API key, local fallback notice, save and clear-secret actions, status text.
- Extended `MainActivity` to save/restore the new settings and run license validation before connecting.
- Extended `VpnConnectionController` and `AetherVpnService` to pass non-secret AI/license settings through intents and inject runtime environment variables into the native core process.
- Added English and Persian strings for all new Android UI text.

## Runtime Environment Variables Exported to Native Core

- `V2RAYEZ_LICENSE_KEY`
- `V2RAYEZ_LICENSE_ACCOUNT_ID`
- `V2RAYEZ_LICENSE_SERVER`
- `V2RAYEZ_AI_PROVIDER_ALIAS`
- `V2RAYEZ_AI_PROVIDER_ENDPOINT`
- `V2RAYEZ_AI_PROVIDER_MODEL`
- `V2RAYEZ_AI_PROVIDER_API_KEY`
- `V2RAYEZ_AI_LOCAL_FALLBACK=1`

Secret values are read from Android Keystore-backed encrypted storage only when launching the native core and are not logged.

## Validation Run

```bash
python3 - <<'PY'
import xml.etree.ElementTree as ET
for path in [
    'V2RayEZ-GUI/android/app/src/main/res/layout/activity_main.xml',
    'V2RayEZ-GUI/android/app/src/main/res/values/strings.xml',
    'V2RayEZ-GUI/android/app/src/main/res/values-fa/strings.xml',
]:
    ET.parse(path)
    print('xml ok', path)
PY
python3 - <<'PY'
from pathlib import Path
files = {
 'MainActivity': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/MainActivity.java').read_text(),
 'Service': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/AetherVpnService.java').read_text(),
 'Controller': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/VpnConnectionController.java').read_text(),
 'SecretStore': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/AndroidSecretStore.java').read_text(),
 'LicenseGate': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/AndroidLicenseGate.java').read_text(),
 'Layout': Path('V2RayEZ-GUI/android/app/src/main/res/layout/activity_main.xml').read_text(),
}
checks = {
 'MainActivity': ['saveLicenseSettings', 'saveAiSettings', 'AndroidLicenseGate.Decision', 'continueConnectAfterLicense', 'license_validating'],
 'Service': ['V2RAYEZ_LICENSE_KEY', 'V2RAYEZ_LICENSE_SERVER', 'V2RAYEZ_AI_PROVIDER_API_KEY', 'V2RAYEZ_AI_LOCAL_FALLBACK'],
 'Controller': ['licenseAccountId', 'licenseServerUrl', 'aiProviderAlias', 'aiLocalFallback'],
 'SecretStore': ['AndroidKeyStore', 'AES/GCM/NoPadding', 'LICENSE_SERIAL', 'AI_API_KEY'],
 'LicenseGate': ['HttpURLConnection', '/api/licenses/validate', 'offlineGraceUntil', 'localHardCutoff', 'license_expired', 'offline_grace_expired'],
 'Layout': ['license_serial_input', 'ai_api_key_input', 'ai_provider_endpoint_input'],
}
for name, needles in checks.items():
    text = files[name]
    for needle in needles:
        assert needle in text, f'{name}: {needle}'
print('android license gate/settings static checks pass')
PY
git diff --check
```

Result: PASS for XML parse, static source assertions, and whitespace checks.

Blocked locally:

- Android Java/Gradle compile cannot run because the sandbox still lacks Java/Android SDK tooling.
- Device-level validation requires Android runtime/hardware and a reachable dashboard license server.

## Still Pending

- Real Android `.apk` build and signed release test.
- Real Android runtime validation of online/offline grace and hard cutoff.
- Native core consumption of the new environment variables across every Android ABI.
