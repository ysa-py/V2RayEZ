# Milestone 13 Report — iOS V2RayEZ Identity and IPA Project Preparation

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Goal

Continue the product-identity correction across remaining platform assets: V2RayEZ must remain the final product/GUI identity, while donor capabilities and provenance remain preserved.

## Changes Applied

- Rebranded active iOS app metadata in `MICAFP/ios/Info.plist`:
  - Display/name: `V2RayEZ`.
  - Bundle ID: `app.v2rayez.ios`.
  - Version: `2.0.0` / build `200`.
  - Network Extension provider key: `app.v2rayez.ios.PacketTunnel`.
  - Privacy strings now refer to V2RayEZ.
- Rebranded active iOS UI/tunnel user-visible strings:
  - `StatusView` navigation title now shows `V2RayEZ`.
  - `TunnelManager` uses `app.v2rayez.ios.PacketTunnel`, server address `V2RayEZ`, and localized description `V2RayEZ`.
- Added iOS packaging scaffolding for a real IPA path:
  - `MICAFP/ios/project.yml` XcodeGen spec for app + packet tunnel extension.
  - `MICAFP/ios/V2RayEZ.entitlements`.
  - `MICAFP/ios/V2RayEZPacketTunnel.entitlements`.
  - `MICAFP/ios/V2RayEZPacketTunnel/Info.plist`.
  - `MICAFP/ios/ExportOptions.plist`.
- Updated `MICAFP/ios/Podfile` target names from donor names to `V2RayEZ` and `V2RayEZPacketTunnel`, and removed the invalid `SwiftUI` CocoaPod declaration because SwiftUI is an Apple framework, not a CocoaPod dependency.
- Updated the CI workflow templates to validate iOS plist/project metadata and to generate/archive via XcodeGen when moved into active `.github/workflows/` after workflow permission is granted.
- Sanitized the remaining EasySNI donor sample label `@hamvex` to `@V2RayEZ` without changing the protocol, endpoint, SNI, WebSocket path, or transport parameters.

## Validation Run

```bash
python3 - <<'PY'
from pathlib import Path
import plistlib
for path in [Path('MICAFP/ios/Info.plist'), Path('MICAFP/ios/V2RayEZPacketTunnel/Info.plist'), Path('MICAFP/ios/ExportOptions.plist'), Path('MICAFP/ios/V2RayEZ.entitlements'), Path('MICAFP/ios/V2RayEZPacketTunnel.entitlements')]:
    with path.open('rb') as fh:
        data = plistlib.load(fh)
    print('plist pass', path, data.get('CFBundleIdentifier', 'entitlements/export'))
for path in [Path('MICAFP/ios/project.yml'), *Path('docs/ci/github-workflows').glob('*.yml.sample')]:
    text = path.read_text()
    assert '\t' not in text, f'tab in {path}'
    assert text.endswith('\n')
    print('yaml basic pass', path, len(text.splitlines()))
PY
python3 - <<'PY'
from pathlib import Path
files = [
    Path('MICAFP/ios/UnifiedShield/App/AIProviderGateway.swift'),
    Path('MICAFP/ios/UnifiedShield/App/LicenseManager.swift'),
    Path('MICAFP/ios/UnifiedShield/App/SettingsView.swift'),
    Path('MICAFP/ios/UnifiedShield/App/StatusView.swift'),
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionAIAdvisor.swift'),
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionLicenseGate.swift'),
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/PacketTunnelProvider.swift'),
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/TunnelManager.swift'),
]
for path in files:
    text = path.read_text()
    assert text.count('{') == text.count('}'), f'brace imbalance: {path}'
    print('swift brace pass', path)
PY
grep -R -n "hamvex" "EasySNI- Make sure to fully add all features to the V2RayEZ app/Configs/Spoof-Configs.txt" || true
grep -R -n "com\.shield\|com\.unifiedshield\.packet-tunnel\|UnifiedShield VPN\|serverAddress: \"UnifiedShield\"\|navigationTitle(\"UnifiedShield\")" MICAFP/ios/Info.plist MICAFP/ios/UnifiedShield || true
git diff --check
```

Result: PASS locally for plist parsing, YAML-template basic checks, Swift brace checks, EasySNI legacy label removal, active iOS user-visible identity checks, and whitespace checks.

## Still Pending

- Full iOS compile/archive/export remains blocked locally because Xcode and Apple signing material are unavailable in this Linux sandbox.
- The XcodeGen project should be generated and archived on a macOS runner after the workflow template is activated and signing is configured.
