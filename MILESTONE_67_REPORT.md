# Milestone 67 — Enterprise V2RayEZ identity + automatic connect preflight

## Scope
- Replace the remaining Aether "A" product icon with a canonical enterprise V2RayEZ V mark.
- Keep every donor/project logo and every existing capability in place.
- Make Android connect fully automatic about unsafe local settings (Smart Repair preflight) without deleting user data.

## Changes
- `brand/v2rayez-logo.svg` — vector source of truth (hex shield, gradient V, connectivity arc).
- `brand/v2rayez-enterprise-icon.png` and `brand/v2rayez-enterprise-icon-fullbleed.png` — raster masters.
- `scripts/rasterize-brand-icons.sh` — automatic resize/export into desktop, Android, iOS, dashboard, and extension slots.
- Product icons updated: V2RayEZ Android launcher, V2RayEZ-GUI Tauri/Windows/iOS icons, dashboard favicon, Chrome/Firefox extension icons.
- Android `HomeScreen` wordmark now uses `ic_logo_v`.
- `RealVpnController.startLicensedForegroundService` silently applies `SmartRepairPlanner` before the tunnel starts (DNS/ports/MTU/AI fallback/Tor-fronting conflict). It never deletes servers, subscriptions, keys, or packs.
- `tools/v2rayez_brand_gate.mjs` fail-closes if the Aether A path returns or donor-deletion appears in the rasterizer.

## Explicitly not deleted
- EasySNI, MICAFP Flutter/daemon, MSN-GUARD, UAC, and MasterDnsVPN source trees and their original logos.
- All existing connect, license, AI gateway, diagnostics, and routing features.

## Validation
- `node tools/v2rayez_brand_gate.mjs`
- `node tools/android_smart_repair_gate.mjs`
- `node tools/v2rayez_identity_gate.mjs`
- `node tools/requirement_map_gate.mjs`
- `bash -n scripts/rasterize-brand-icons.sh`
- `git diff --check`

## Blocked locally
- Android Gradle / Java, cargo/Tauri, Xcode, and device connectivity remain unavailable in this sandbox.
