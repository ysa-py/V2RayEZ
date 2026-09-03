# V2RayEZ Universal — UI/UX Preservation Changelog

**Date:** 2026-09-01  
**Milestone:** 0 — baseline only  
**UI rule:** The final product must preserve the current V2RayEZ UI/UX and the reference video/design. Advanced features are additive and must be introduced through existing navigation/components, not through disruptive redesigns.

---

## 1) Baseline status

No production UI files were changed in Milestone 0.

The following existing UI surfaces are preserved as the visual/interaction baseline:

- V2RayEZ Android Compose UI:
  - Home connection screen
  - Server list and server editor
  - Browser
  - MITM / Domain Fronting screens
  - Tools screen including BPB Panel and Domain Fronting tools
  - Core Manager
  - Advanced VPN settings
  - Logs
  - Statistics
  - Hotspot Share
  - Warp
  - Notifications
  - About
  - Welcome/onboarding wizard
  - Quick Connect and Control Panel widgets
- V2RayEZ desktop compact navigation (V2RayEZ-GUI Aether-adapter donor behavior only):
  - Connect
  - Configurations
  - Settings
- EasySNI desktop/web tooling layout:
  - Local web panel
  - scanner/config/tool tabs
  - light/dark and Persian/English behavior
- UAC-Windows wizard assistant:
  - 8 image states
  - logic in `assistant.py`
  - text in `assistant_messages.py`

---

## 2) Additive UI placement plan

| Feature family | UI placement | Design constraint |
|---|---|---|
| AI Provider Gateway | Settings → Advanced / AI Engine card | Use existing card/list setting style; no modal unless user taps Test/Auto-detect. |
| License activation/renewal | Settings + calm Home expiry chip/banner | No noisy popups; tunnel start may show inline blocking reason when expired. |
| DNS Tunnel | Tools + protocol picker + Core Manager addon | Reuse existing tool screens and structured editor patterns. |
| Aether/MSN transports | Advanced VPN / Engine Mode sections | Preserve current home connect flow. |
| MICAFP advanced transports | Advanced protocol editor and Core Manager | Hide experimental modes behind advanced/feature-flag labels. |
| Mesh/P2P/National Intranet | Tools/Resilience section | Clear emergency/offline labels; off by default unless user opts in. |
| Post-Quantum Lab | Settings → Experimental Lab | Off by default; never required for core connection. |
| EasySNI scanners/BPB/EdgeTunnel | Tools section | Reuse current BPB Panel and scanner pages; no separate alien UI. |
| UAC route speed test | Tools / Route Speed Test | Preserve V2RayEZ visual theme; show progress inline. |
| Mobile Gateway | Hotspot Share / Desktop sharing screen | Match existing Hotspot Share semantics. |
| Dashboard license admin | Existing Next.js dashboard navigation | Separate from monitoring/control-plane pages. |

---

## 3) UI non-regression gates to add in later milestones

- Screenshot tests for Home, Servers, Settings, Tools, Core Manager, Logs, Statistics, License, AI Engine, DNS Tunnel setup, Route Speed Test, and Desktop Connect/Settings.
- RTL screenshot tests for Persian.
- String parity gate for English/Persian/Russian after every UI addition.
- Navigation smoke tests proving no existing route disappeared.
- Accessibility pass for new cards/buttons: labels, content descriptions, focus order, keyboard navigation on desktop.

---

## 4) Milestone 0 changes

| Change | Files | Type | Status |
|---|---|---|---|
| Added UI preservation contract | `UI_CHANGELOG.md` | Documentation | complete |
| Added Gemini engineering prompt in previous step | `GEMINI_V2RAYEZ_UNIVERSAL_PROMPT.md` | Documentation | complete |

No app screens, layouts, resources, or design tokens were modified.

---

## 5) Milestone 1 UI impact

| Change | Files | UI impact | Status |
|---|---|---|---|
| Added backend/license API primitives | `MICAFP/dashboard/src/app/api/licenses/**`, `src/lib/license-*` | No app UI changed | complete |
| Added AI provider test backend | `MICAFP/dashboard/src/app/api/ai-engine/providers/test/route.ts`, `src/lib/ai-provider-gateway.*` | No app UI changed yet; future Settings → AI Engine card must follow baseline style | complete |
| Added Rust core API crate | `universal-core/**` | No app UI changed | complete |

No Android Compose, desktop webview, LuCI, or iOS UI file was changed in Milestone 1.

---

## 6) Milestone 2 Android UI impact

| Change | Files | UI impact | Status |
|---|---|---|---|
| Added Settings → License row/screen | `SettingsScreen.kt`, `LicenseScreen.kt`, `Routes.kt`, `V2RayApp.kt` | Additive only; existing Settings groups/card style preserved | in progress |
| Added Settings → AI Engine row/screen | `SettingsScreen.kt`, `AiEngineScreen.kt`, `Routes.kt`, `V2RayApp.kt` | Additive only; no bottom tabs/design tokens changed | in progress |
| Added EN/FA/RU strings | `res/values*/strings.xml` | Localized labels for the two new settings screens | string parity PASS |

No existing route or baseline screen was removed/redesigned. Screenshot tests are still pending because the Android toolchain is unavailable in the sandbox.

---

## 7) Milestone 3 desktop UI impact

| Change | Files | UI impact | Status |
|---|---|---|---|
| Added desktop Settings → License block | `V2RayEZ-GUI/src/index.html`, `src/app.js`, `src/i18n.js`, `src/styles.css` | Additive only inside existing Settings scroll view; drawer nav/home layout unchanged | frontend tests PASS |
| Added desktop Settings → AI Engine block | `src/index.html`, `src/app.js`, `src/i18n.js`, `src/styles.css` | Additive provider form for no-code AI additions; existing compact mobile-style visual language preserved | frontend tests PASS |
| Added static UI regression test | `tests/frontend.test.mjs` | Ensures License/AI controls, EN/FA labels, Tauri command references, and secret-free settings model remain present | PASS |

No desktop navigation item was removed, no home orb/status redesign was made, and the compact Android-parity V2RayEZ layout remains intact; the legacy donor GUI is not the product GUI.

---

## 8) Milestone 4 OpenWrt LuCI UI impact

| Change | Files | UI impact | Status |
|---|---|---|---|
| Added LuCI License section | `MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua` | Additive License status/config/validate controls; serial value remains file-only and is not displayed | shell helper syntax PASS; LuCI runtime pending |
| Added LuCI AI Engine/provider table | `MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua` | Additive no-code provider management using existing LuCI CBI style | Lua runtime pending |
| Added status JSON fields/actions | `MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/controller/unifiedshield.lua` | Existing status endpoint now reports license/AI state; no existing action removed | Lua runtime pending |

No LuCI route was intentionally removed. Existing UnifiedShield status/log/start/stop/restart/switch-core controller actions remain present.

---

## 9) Milestone 5 iOS UI impact

| Change | Files | UI impact | Status |
|---|---|---|---|
| Added SwiftUI License section | `MICAFP/ios/UnifiedShield/App/SettingsView.swift` | Additive inside existing Settings form; existing Security/DNS/General/About sections retained | Swift static brace check PASS; Xcode build pending |
| Added SwiftUI AI Engine section | `MICAFP/ios/UnifiedShield/App/SettingsView.swift` | Additive provider form matching the simple existing Settings form style | Swift static brace check PASS; Xcode build pending |

No iOS screen redesign was performed; the existing MICAFP SwiftUI form structure remains the base.

---

## 10) Milestone 6 dashboard UI impact

| Change | Files | UI impact | Status |
|---|---|---|---|
| Added dashboard License tab/panel | `MICAFP/dashboard/src/app/page.tsx`, `src/components/license-admin-panel.tsx` | Additive tab using existing card/badge/button visual style | lint/build blocked by missing dependencies |
| Added dashboard AI Gateway tab/panel | `MICAFP/dashboard/src/app/page.tsx`, `src/components/ai-provider-gateway-panel.tsx` | Additive no-code provider test panel next to existing AI orchestration tab | lint/build blocked by missing dependencies |

No existing dashboard tab/module was intentionally removed.

---

## 11) Milestone 67 enterprise identity UI impact

| Change | Files | UI impact | Status |
|---|---|---|---|
| Replaced donor Aether "A" desktop icon with V2RayEZ enterprise V mark | `brand/`, `V2RayEZ-GUI/src-tauri/icons/**`, Android launcher art | Identity-only; no navigation/routes removed | brand gate added |
| Home wordmark uses `ic_logo_v` instead of a plain letter | `HomeScreen.kt` | Additive visual; Home layout unchanged | complete |
| Desktop drawer/about marks use enterprise SVG | `V2RayEZ-GUI/src/styles.css`, `src/v2rayez-logo.svg` | Compact nav preserved; letter V remains in HTML for a11y/tests | complete |

No existing screen, tab, or capability was removed. Donor project logos outside product surfaces were left in place.
