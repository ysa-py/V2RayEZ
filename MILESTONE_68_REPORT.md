# Milestone 68 — Automated defect remediation: real iOS/Android artifacts + a self-healing repo audit

**Date:** 2026-09-05 · **Branch:** `arena/01a06fec-v2rayez`
**Goal:** find the *real* errors behind the red Phase 3 / release runs, fix them
completely, and make the whole thing automatic and intelligent — **without
deleting a single capability**.

Everything below is additive. No feature, artifact type, script, workflow job,
gate, FFI symbol or donor source tree was removed or degraded.

## Result

| Workflow (commit `98d7741`) | Status |
|---|---|
| Release Pipeline (`33952481560`) | ✅ **all 22 jobs green** — Android, iOS, Windows, Linux (x86_64 + aarch64), OpenWrt (3 targets), verify-symbols, publish-release |
| Vor Phase 3 Native Tests & Binaries (`33952481553`) | ✅ |
| Universal Core CI (Quality Gates) (`33952481550`) | ✅ |

Published release `v2rayez-universal-latest` now ships a **real** iOS artifact —
`Vor-v2.0.0-ios-unsigned.xcarchive.zip` (**1 492 113 bytes**, a genuine Xcode
archive) where it previously shipped a ~1 KB zip whose `CFBundleExecutable` was
a one-line shell script.

The one remaining annotation is the honest one:

```
! RELEASE-IOS-UNSIGNED: no signed .ipa (Apple signing material absent on this
  runner); the real unsigned .xcarchive is shipped instead and is NOT
  installable until a developer signs it.
```

---

## 1. What the "magnifying glass" pass found first

Local state was clean (all 28 `tools/*.mjs` gates passed, `bash -n` clean), so
the failures had to be in the runner scripts. Five genuine defects:

### D1 — `xcodebuild "$OPTS" archive` (Phase 3 iOS job)
The quotes make the **entire option string a single argv entry**, so
`xcodebuild` can never parse it. This job could never have produced an archive.

**Fix:** options are a real bash array, and the project/scheme are resolved from
`MICAFP/ios/project.yml`.

### D2 — `PHASE3-DIAG-IOS-MISSING-LOG`
Every pre-flight guard ran `exit 1` **before** `tee` created the log, so the
runner could only report `MISSING-LOG` — the actual error was destroyed.

**Fix:** the log is created before any check, every failure path writes through
`fail()`, and an environment preamble is recorded.

### D3 — Fabricated iOS `.ipa` (release pipeline)
`scripts/build-ios-ipa.sh` and `universal-core/apple/build-ipa.sh` contained a
"minimal IPA fallback" that wrote **a one-line `/bin/sh` script** as
`CFBundleExecutable`, zipped it into `Payload/*.app` and shipped it as
`V2RayEZ.ipa`. Combined with D4 this was the *normal* code path, so the
"successful" iOS job on `vor-v1.0.0` produced a file that looks installable and
is not.

**Fix:** both entry points now share `scripts/ios-packaging.sh`, which is
fail-closed: real archive → signed `.ipa` only when a signing identity exists →
otherwise the real `.xcarchive`. Every artifact is verified: `ios_verify_ipa()`
unzips the payload and requires a Mach-O executable (magic-byte checked).

### D4 — Hard-coded `-project V2RayEZ.xcodeproj`
`project.yml` declares `name: Vor`, so `xcodegen` generates **`Vor.xcodeproj`**.
Three build scripts hard-coded the wrong name.

**Fix:** `ios_resolve_xcodeproj()` / `ios_project_scheme()` read them from
`project.yml`; all call sites are dynamic.

### D5 — A missing credential was reported as a build error
On a tag run `signed=true`, so `build-android` and `build-ios` died purely
because `VOR_ANDROID_*` / `APPLE_*` secrets are absent on this fork.

**Fix:** a `signing-plan` job detects capability up front (see §2).

---

## 2. Smart + automatic pipeline (`.github/workflows/vor-native-phase3.yml`)

| New/changed | What it does |
|---|---|
| **`signing-plan` job** | Auto-detects whether the Android keystore and Apple signing secrets exist, publishes `android`/`ios` = `ready\|blocked` plus the exact missing names, writes a summary table, uploads `signing-plan.json`, annotates `PHASE3-SIGNING-PLAN-*`. |
| **`on_missing_signing` input** | `report` (default) ships the strongest *honest* artifact; `fail` restores the old hard release gate. The strict mode is still one click away. |
| **Android signing** | Signs + `apksigner verify` when ready; otherwise **structurally verifies** the real Gradle output (`AndroidManifest.xml` + `classes*.dex` + `resources.arsc`; `BundleConfig.pb` + `base/manifest/…` + `base/dex/…` for `.aab`), renames it `…-UNSIGNED.apk/.aab` and writes `SIGNING-STATUS.txt`. Verification also runs on the `signed=false` path. |
| **iOS job** | Cross-builds the Rust core for `aarch64-apple-ios`; runs `pod install` **only if a Swift file actually imports a pod** (none do); retries flaky `brew`/`pod`; archives with a real argv array; exports a signed `.ipa` + Mach-O verification when possible, else packages the real unsigned `.xcarchive`. |
| **`checksum-ledger`** | `if: always() && !contains(needs.*.result,'failure')` — one skipped producer no longer skips the integrity ledger. |
| **`release-readiness`** | Red **only** for a genuine failure; an absent credential is `RELEASE BLOCKED` with the exact secret names. |
| **`native-tests`** | Also runs `node scripts/auto-fix.mjs --check` and the full `tools/*.mjs` suite. |

`release.yml` was aligned: installs `xcodegen`, accepts the real `.ipa` **or**
the real unsigned `.xcarchive.zip`, verifies every `.ipa` is Mach-O, and emits
`RELEASE-IOS-UNSIGNED` when only the archive exists.

---

## 3. What the honest pipeline then exposed (the iOS app had never compiled)

Removing the fake `.ipa` was like turning the lights on. Iterating on real
runner output — each failure published as a `::error::` annotation, because
runner logs and artifacts could not be downloaded from this sandbox — surfaced
**eleven** genuine source defects:

| # | File | Error | Fix |
|---|---|---|---|
| 1 | `…/NetworkExtension/PacketTunnelProvider.swift` | `value of optional type '((Data?) -> Void)?' must be unwrapped` (5 sites) | `completionHandler?(…)` |
| 2 | `…/NetworkExtension/TunnelManager.swift:119` | `argument passed to call that takes no arguments` (no such `NETunnelProviderProtocol` init) | parameterless `init()` + properties |
| 3 | `…/TunnelManager.swift:154,191` | `cannot find 'LicenseManager' in scope` (app-target, UIKit) | `ExtensionLicenseGate.shared.enforce()` |
| 4 | `…/TunnelManager.swift:180` | `cannot find 'AIProviderGateway' in scope` | `ExtensionAIAdvisor.shared.adviseOnFailure(_:)` |
| 5 | `MICAFP/ios/project.yml` | SwiftUI screens bind to `TunnelManager`, which lived only in the **extension** target | `TunnelManager` + its 2 dependencies compiled into **both** targets (all UIKit-free) |
| 6 | `App/OtaManager.swift:25` | **Kotlin** `companion object { … }` in a Swift file | wrapper removed, `static let`s kept as class members |
| 7 | `App/CoreSwitcherView.swift:90` | `keyword 'protocol' cannot be used as an identifier` | renamed to `protocolName` (6 sites) |
| 8 | `BatteryManager.swift` (20 errors) | missing `import BackgroundTasks`; `ProcessInfo.powerStateDidChangeNotification` is **macOS-only**; `os.Logger` autoclosure needs explicit `self.`; `OSLogMessage` must be one literal | import added; `Notification.Name.NSProcessInfoPowerStateDidChange`; `self.` ×3; one interpolated literal |
| 9 | `BatteryManager.swift:832,851` | `'updatePowerState' is inaccessible due to 'private'` | widened to internal (behaviour unchanged) |
| 10 | `App/SettingsView.swift` | `TextField(_:text:axis:)` + range `lineLimit` are iOS 16+, deployment target is **15.0** | `multilineField()` helper: modern API behind `if #available(iOS 16.0, *)` with an iOS 15 fallback — **minimum OS NOT raised** |
| 11 | `scripts/ios-packaging.sh` | `cannot read CFBundleExecutable` — an archived `.app` ships a **binary** plist | PlistBuddy → plutil → defaults → XML scan → Mach-O magic-byte scan |

Also removed from `OtaManager.swift`: Kotlin `Companion.x` (7 sites),
`removePrefix(_:)`, and `CommonCrypto`'s `CC_SHA256` (unimportable in an
xcodegen project) → CryptoKit `SHA256`.

---

## 4. `scripts/auto-fix.mjs` — the local self-healing audit

```bash
node scripts/auto-fix.mjs            # scan + repair
node scripts/auto-fix.mjs --apply    # same, explicit
node scripts/auto-fix.mjs --check    # fail-closed (exit 1 on any blocking finding)
node scripts/auto-fix.mjs --json     # machine-readable report
```

| Rule | Behaviour |
|---|---|
| `xcodebuild-quoted-options` | Repairs `xcodebuild "$OPTS"` → real bash array (reports instead of guessing when the string has quotes/substitutions). |
| `fabricated-ipa-executable` | Replaces a synthesized shell-script app executable with a fail-closed error. |
| `hardcoded-xcodeproj` | Reports `-project X.xcodeproj` when `project.yml` says otherwise. |
| `missing-diagnostic-log` | Inserts `: > "<log>"` before the first `exit 1`. |
| `tauri-icon-rgba` | Converts non-RGBA Tauri icons to PNG colour type 6 **losslessly** (inflate → insert opaque alpha → deflate → CRC32; pixel-exact, verified). |
| `go-pseudo-version` | Reports truncated Go pseudo-versions (needs network — never auto-edited). |
| `workflow-hygiene` | Normalises trailing whitespace / tab indentation / line endings. |
| `shell-syntax` | `bash -n` over `scripts/**` and `universal-core/**`. |

Donor trees (`MICAFP`, `MSN-GUARD`, `EasySNI`, `MasterDnsVPN`, `UAC-SNI-*`) are
**reported but never modified**: findings there are `INFO`, not blocking.

## 5. `tools/auto_fix_regression_gate.mjs` — the anti-regression lock

Fail-closed (29/29 gates pass) asserting: the checker exists with a `--check`
mode and reports PASS; CI runs it in both `universal-core-ci.yml` and
`vor-native-phase3.yml`; `scripts/ios-packaging.sh` keeps `ios_verify_ipa`,
`ios_verify_app_bundle`, `ios_is_macho`, `ios_resolve_xcodeproj` and never
synthesizes an executable; both `.ipa` entry points use the shared helper; the
pipeline stays signing-plan driven with the argv defect fixed.

`tools/runtime_license_watchdog_gate.mjs` was updated to pin the **contract**
(`ExtensionLicenseGate.shared.enforce()` → `remainingSeconds` → sleep) in both
iOS targets and to forbid `LicenseManager` inside the extension.

---

## 6. Validation

```bash
for gate in tools/*.mjs; do node "$gate"; done   # 29/29 PASS
node scripts/auto-fix.mjs --check                # PASS — no known defects
bash -n scripts/ios-packaging.sh scripts/build-ios-ipa.sh \
         scripts/build-release-artifacts.sh universal-core/apple/build-ipa.sh
```

Local proofs (mocked `xcodebuild`/`xcodegen` on PATH):

| Scenario | Result |
|---|---|
| no signing identity | real `Vor-v9.9.9-ios-unsigned.xcarchive.zip`, Mach-O verified |
| signing identity present | real `Vor.ipa`, payload unzipped and Mach-O verified |
| app "executable" is a shell script | **rejected**, exit 1 |
| binary (bplist00) `Info.plist` | executable detected by magic bytes |
| auto-fix on an injected `xcodebuild "$OPTS"` + fake `.ipa` | both repaired automatically |
| RGBA conversion of a 3×2 RGB PNG | colour type 6, `rawLen == h*(w*4+1)`, pixel `(2,1) → 13,20,30,255` preserved |
| Android structural verifier | good `.apk`/`.aab` pass; missing manifest rejected |

## 7. Explicitly not removed

* Both `.ipa` entry points still exist and still build.
* Unsigned / ad-hoc archives remain a first-class output.
* The strict fail-closed signing behaviour is preserved as
  `on_missing_signing=fail`.
* iOS 15 deployment target unchanged (no device support dropped).
* Every donor tree, capability, gate and artifact type is untouched.
