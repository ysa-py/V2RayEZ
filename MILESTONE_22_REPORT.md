# Milestone 22 Report — iOS Shared License/AI Storage Hardening

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Ensure the iOS V2RayEZ container app and Packet Tunnel extension read the same serial/license, offline grace, and AI Provider Gateway settings. Before this pass, the code used `UserDefaults.standard` and default Keychain access in multiple places, which risks the extension not seeing app-configured license and AI settings at runtime.

## Changes Applied

- Added shared Keychain entitlement to both iOS targets:
  - `$(AppIdentifierPrefix)app.v2rayez.ios`
- Added `V2RayEZKeychainAccessGroup` to the app and Packet Tunnel Info.plists so runtime keychain queries can use the resolved Apple Team/App Identifier prefix.
- Updated iOS license storage:
  - `LicenseManager` now uses App Group defaults: `group.app.v2rayez.ios`.
  - Keychain set/get/delete queries now include the shared V2RayEZ keychain access group when available.
- Updated iOS AI provider storage:
  - `AIProviderGateway` now uses App Group defaults and the shared V2RayEZ keychain access group for provider API secrets.
  - Local AI provider identity is now `local-v2rayez`, `local://v2rayez`, and `v2rayez-anti-dpi-local`, with compatibility handling for older `local-aether` selections.
- Updated iOS settings UI bindings:
  - `@AppStorage` uses the same App Group store as the extension.
- Updated Network Extension helpers:
  - `ExtensionLicenseGate` uses App Group defaults and shared Keychain access group.
  - `ExtensionAIAdvisor` uses App Group defaults and user-visible fallback text now says V2RayEZ core profile.
- Small Android identity consistency cleanup:
  - User-visible Android service logs/errors now say V2RayEZ core instead of Aether core while preserving internal donor binary names and provenance.

## Validation Run

```bash
python3 - <<'PY'
import plistlib
from pathlib import Path
for path in ['MICAFP/ios/Info.plist','MICAFP/ios/V2RayEZPacketTunnel/Info.plist','MICAFP/ios/V2RayEZ.entitlements','MICAFP/ios/V2RayEZPacketTunnel.entitlements']:
    data = plistlib.loads(Path(path).read_bytes())
    print('plist ok', path, sorted(data.keys())[:4])
assert plistlib.loads(Path('MICAFP/ios/V2RayEZ.entitlements').read_bytes())['keychain-access-groups'] == ['$(AppIdentifierPrefix)app.v2rayez.ios']
assert plistlib.loads(Path('MICAFP/ios/V2RayEZPacketTunnel.entitlements').read_bytes())['keychain-access-groups'] == ['$(AppIdentifierPrefix)app.v2rayez.ios']
assert plistlib.loads(Path('MICAFP/ios/Info.plist').read_bytes())['V2RayEZKeychainAccessGroup'] == '$(AppIdentifierPrefix)app.v2rayez.ios'
assert plistlib.loads(Path('MICAFP/ios/V2RayEZPacketTunnel/Info.plist').read_bytes())['V2RayEZKeychainAccessGroup'] == '$(AppIdentifierPrefix)app.v2rayez.ios'
print('ios plist shared keychain assertions pass')
PY
python3 - <<'PY'
from pathlib import Path
checks = {
'MICAFP/ios/UnifiedShield/App/LicenseManager.swift':['UserDefaults(suiteName: "group.app.v2rayez.ios")', 'applyKeychainAccessGroup', 'V2RayEZKeychainAccessGroup'],
'MICAFP/ios/UnifiedShield/App/AIProviderGateway.swift':['UserDefaults(suiteName: "group.app.v2rayez.ios")', 'local-v2rayez', 'local://v2rayez', 'applyKeychainAccessGroup'],
'MICAFP/ios/UnifiedShield/App/SettingsView.swift':['store: UserDefaults(suiteName: "group.app.v2rayez.ios")', 'local-v2rayez', 'v2rayez-anti-dpi-local'],
'MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionLicenseGate.swift':['UserDefaults(suiteName: "group.app.v2rayez.ios")', 'applyKeychainAccessGroup', 'V2RayEZKeychainAccessGroup'],
'MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionAIAdvisor.swift':['UserDefaults(suiteName: "group.app.v2rayez.ios")', 'V2RayEZ core profile'],
}
for path, needles in checks.items():
    text = Path(path).read_text()
    for needle in needles:
        assert needle in text, f'{path}: {needle}'
print('ios shared settings/keychain static checks pass')
PY
git diff --check
```

Result: PASS for plist parsing, shared storage/keychain assertions, and whitespace checks.

Blocked locally:

- iOS compile/archive/export remains blocked because this Linux sandbox does not include Xcode or Apple signing material.
- Real App Group/Keychain access group behavior must be validated on signed iOS builds.

## Still Pending

- Xcode archive/export of `.ipa`.
- Runtime validation on a signed iOS device/TestFlight build.
- Dashboard-backed license validation E2E with iOS app + Packet Tunnel extension.
