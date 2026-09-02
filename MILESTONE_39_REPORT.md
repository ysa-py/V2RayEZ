# Milestone 39 Report — OpenWrt LuCI Visible V2RayEZ Identity Guard

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Keep the router UI aligned with the user's correction: the product UI/UX must be V2RayEZ, while donor/OpenWrt service internals may remain behind that UI where required for package compatibility.

## Changes Applied

- Updated OpenWrt LuCI package metadata and UI wording:
  - menu/title now shows `V2RayEZ Universal` / V2RayEZ router VPN support.
  - start/stop/restart JSON messages now say V2RayEZ instead of donor product names.
  - legacy LuCI model labels now present V2RayEZ Universal.
  - current CBI configuration description now says V2RayEZ and describes the preserved OpenWrt runtime pipeline without presenting a donor UI.
  - donor core label `Aether / MSN-GUARD core` is now presented as `Adaptive Rust Core (advanced anti-DPI)`.
- Added `license_last_server_time` to the LuCI status/config surface as `Last trusted server time`, matching Milestone 38's runtime server-time rollback protection.
- Extended `tools/v2rayez_identity_gate.mjs` with OpenWrt LuCI-specific visible-string checks so translated/menu/API-message surfaces cannot reintroduce visible `UnifiedShield` or `Aether` identity.

## Preserved Internals

The package path, UCI config name, init/service name, executable paths, and internal module names still use `unifiedshield` where changing them would break existing OpenWrt package compatibility. These are implementation details; user-facing labels are V2RayEZ.

## Validation Run

```bash
node --check tools/v2rayez_identity_gate.mjs
node tools/v2rayez_identity_gate.mjs
node --check tools/runtime_license_watchdog_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node --check tools/openwrt_packaging_gate.mjs
node tools/openwrt_packaging_gate.mjs
MICAFP/scripts/package-openwrt.sh --check
bash -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
npm run lint --prefix MICAFP/dashboard
npm run build --prefix MICAFP/dashboard
git diff --check
```

Result: PASS.

## Local Blockers

- `lua`/`luac` are not installed in this sandbox, so LuCI runtime syntax validation on an OpenWrt image is still pending.
- Target OpenWrt SDK package generation and router UI validation remain pending on a real OpenWrt build/test environment.
