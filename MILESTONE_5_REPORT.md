# Milestone 5 Report — iOS License + AI Wiring

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Scope Completed

This milestone adds first-pass iOS app and Network Extension wiring for the required serial/license system and AI Provider Gateway using the existing MICAFP iOS/UnifiedShield source path.

## iOS Changes

Changed under `MICAFP/ios/UnifiedShield/`:

- `App/LicenseManager.swift`
  - Added Keychain-backed serial, device ID, and grace-token storage.
  - Implements compact Ed25519 serial verification with `CryptoKit` (`V2RayEZ-License`).
  - Validates status/account/not-before/expiry locally.
  - Supports online `/api/licenses/validate` and stores signed grace tokens.
  - Verifies signed grace token/device hash for offline use.
  - Persists only redacted/status metadata in `UserDefaults`.
- `App/AIProviderGateway.swift`
  - Added no-code provider definitions for local, OpenAI-compatible, Anthropic, Gemini, and generic HTTP providers.
  - Stores provider configs in `UserDefaults` and API secrets in Keychain by alias.
  - Supports request templates, response-path extraction, secret redaction, and local fallback when external APIs are blocked/unreachable.
- `App/SettingsView.swift`
  - Added additive License section: account, validation URL, device label, Ed25519 public key PEM, offline grace toggle, serial activation, validate, clear.
  - Added additive AI Engine section: enable/fallback toggles, provider ID/name/type/base URL/endpoint/model/API-key alias/secret/header JSON/request template/response path, save/test.
  - Existing Security, DNS, General, and About sections remain present.
- `NetworkExtension/TunnelManager.swift`
  - `startVPN()` now validates the license before calling `startTunnel()`.
  - Adds a connected-session license watchdog that disconnects on expiry/revocation/grace failure.
  - Logs local AI advisor output on `startTunnel()` failure.
- `NetworkExtension/PacketTunnelProvider.swift`
  - Packet tunnel start now preflights `ExtensionLicenseGate` before network settings/core startup.
  - Starts a Network Extension watchdog and cancels the tunnel if the serial/grace becomes invalid.
  - Logs deterministic local AI advisor guidance if core startup fails.
- `NetworkExtension/ExtensionLicenseGate.swift`
  - Adds extension-local Keychain-backed license enforcement so the tunnel extension fail-closes even if the container UI/controller path is bypassed.
- `NetworkExtension/ExtensionAIAdvisor.swift`
  - Adds non-blocking local AI fallback guidance for extension-side failures.

## Validation Run

Static checks available in this Linux sandbox:

```bash
python3 - <<'PY'
from pathlib import Path
files=[
'MICAFP/ios/UnifiedShield/App/LicenseManager.swift',
'MICAFP/ios/UnifiedShield/App/AIProviderGateway.swift',
'MICAFP/ios/UnifiedShield/App/SettingsView.swift',
'MICAFP/ios/UnifiedShield/NetworkExtension/TunnelManager.swift',
'MICAFP/ios/UnifiedShield/NetworkExtension/PacketTunnelProvider.swift',
'MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionLicenseGate.swift',
'MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionAIAdvisor.swift',
]
for f in files:
    text=Path(f).read_text()
    bal=0
    for ch in text:
        if ch=='{': bal+=1
        elif ch=='}': bal-=1
    print(f, 'brace_balance=', bal, 'lines=', len(text.splitlines()))
PY
git diff --check
```

Result:

- Swift brace-balance static check — PASS for all seven touched/new Swift files.
- `git diff --check` — PASS.

Toolchain check:

```bash
swift --version
```

Result: BLOCKED — `swift` is not installed in the Linux sandbox.

## Important Security Status

- iOS serial/grace/API secrets are stored in Keychain, not normal preferences.
- The app UI and the packet-tunnel extension both fail closed before tunnel start.
- Final iOS production packaging must configure the App Group/Keychain Access Group so the container app and Network Extension share the same serial/grace/device secrets.

## Remaining Blockers / Pending Validation

- iOS Swift compilation, Xcode project target membership, `.ipa` export, signing, and Network Extension entitlements remain blocked by lack of macOS/Xcode/signing environment.
- Real iOS device tests are pending: valid activation start, expired/revoked block, offline grace hard cutoff, Keychain sharing between app/extension, external AI blocked fallback, and real tunnel traffic/no-leak validation.
