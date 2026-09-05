# Milestone 68 — Automated defect remediation: real iOS/Android artifacts + a self-healing repo audit

**Date:** 2026-09-05 · **Branch:** `arena/01a06fec-v2rayez`
**Goal:** find the *real* errors behind the red Phase 3 / release runs, fix them
completely, and make the whole thing automatic and intelligent — **without
deleting a single capability**.

Everything below is additive. No feature, artifact type, script, workflow job,
gate, FFI symbol or donor source tree was removed or degraded.

---

## 1. What the "magnifying glass" pass actually found

Local state was clean (all 28 `tools/*.mjs` gates passed, `bash -n` clean), so
the failures had to be in the runner scripts. Five genuine defects:

### D1 — `xcodebuild "$OPTS" archive` (Phase 3 iOS job)
`OPTS="-project Vor.xcodeproj -scheme V2RayEZ …"` was then invoked as
`xcodebuild "$OPTS" archive`. The quotes make the **entire option string a
single argv entry**, so `xcodebuild` can never parse it. This job could never
have produced an archive, even with Apple credentials present.

**Fix:** options are now a real bash array (`ARGS=( … )` →
`xcodebuild "${ARGS[@]}" archive`), and the project/scheme are resolved from
`MICAFP/ios/project.yml` instead of being hard-coded.

### D2 — `PHASE3-DIAG-IOS-MISSING-LOG`
The diagnostics step teed `xcodebuild … | tee /tmp/ios-build.log`, but every
pre-flight guard (`APPLE_TEAM_ID missing`, `signed != true`) ran `exit 1`
**before** `tee` existed, so the runner could only report `MISSING-LOG` — the
actual error was destroyed.

**Fix:** the log is created before any check (`: > "$LOG"`), every failure path
writes through `fail() { … | tee -a "$LOG" >&2; }`, and an environment preamble
(signed/plan/mode) is recorded.

### D3 — Fabricated iOS `.ipa` (release pipeline)
`scripts/build-ios-ipa.sh` and `universal-core/apple/build-ipa.sh` contained a
"minimal IPA fallback" that wrote **a one-line `/bin/sh` script** as
`CFBundleExecutable`, zipped it into `Payload/*.app` and shipped it as
`V2RayEZ.ipa`. Combined with D4 (wrong project name) the fallback was the
*normal* code path, so the "successful" iOS job on `vor-v1.0.0` was producing a
file that looks installable and is not.

**Fix:** both entry points now share `scripts/ios-packaging.sh`, which is
fail-closed: it archives for real, exports a signed `.ipa` only when a signing
identity exists, otherwise ships the real `.xcarchive` as a zip, and **verifies
every artifact** — `ios_verify_ipa()` unzips the payload and requires
`Payload/*.app/<CFBundleExecutable>` to be a Mach-O binary (magic-byte checked
via `od`, `file` when available). A non-executable app is never emitted.

### D4 — Hard-coded `-project V2RayEZ.xcodeproj`
`MICAFP/ios/project.yml` declares `name: Vor`, so `xcodegen` generates
**`Vor.xcodeproj`**. Three build scripts hard-coded `V2RayEZ.xcodeproj`:
`scripts/build-ios-ipa.sh`, `universal-core/apple/build-ipa.sh`,
`scripts/build-release-artifacts.sh`.

**Fix:** `ios_resolve_xcodeproj()` / `ios_project_scheme()` read the name and
first target straight out of `project.yml`; all three call sites are dynamic.

### D5 — A missing credential was reported as a build error
On a tag run `signed=true`, so `build-android` died in *Sign / verify* and
`build-ios` died in *Build iOS archive* purely because `VOR_ANDROID_*` /
`APPLE_*` secrets are absent on this fork. The pipeline could not distinguish
"the build is broken" from "this fork has no signing keys", and the run went red
with `ALIAS_PRESENT=false` as the only diagnostic.

**Fix:** see §2 — a `signing-plan` job detects capability up front.

---

## 2. Smart + automatic pipeline (`.github/workflows/vor-native-phase3.yml`)

| New/changed | What it does |
|---|---|
| **`signing-plan` job** | Auto-detects whether `VOR_ANDROID_KEYSTORE_B64/PASSWORD/ALIAS/KEY_PASSWORD` and `APPLE_TEAM_ID` + (`APPLE_PROVISIONING_PROFILE` ∥ `APPLE_SIGNING_IDENTITY`) exist, publishes `android`/`ios` = `ready\|blocked` plus the exact missing names, writes a summary table, uploads `signing-plan.json`, and annotates `PHASE3-SIGNING-PLAN-*`. |
| **`on_missing_signing` input** | `report` (default) ships the strongest *honest* artifact; `fail` restores the old hard release gate. Nothing was taken away — the strict mode is still one click away. |
| **Android signing** | Signs + `apksigner verify` when the plan is `ready`. Otherwise it **structurally verifies** the real Gradle output (`AndroidManifest.xml` + `classes*.dex` + `resources.arsc`; `BundleConfig.pb` + `base/manifest/…` + `base/dex/…` for `.aab`), renames it `…-UNSIGNED.apk/.aab`, and writes `SIGNING-STATUS.txt`. Verification also runs on the `signed=false` path, so a broken build can never hide behind "signing not required". |
| **iOS job** | Cross-builds the Rust core for `aarch64-apple-ios` and stages it (the app/tunnel targets had nothing to link); runs `pod install` **only if a Swift file actually imports one of the pods** (currently none do — that used to cost minutes for nothing); retries flaky `brew install` / `pod install`; archives with a real argv array; exports a signed `.ipa` + Mach-O verification when possible, else packages the real unsigned `.xcarchive`. |
| **`checksum-ledger`** | `if: always() && … && !contains(needs.*.result, 'failure')` — one skipped producer no longer silently skips the integrity ledger for the artifacts that *were* built. |
| **`release-readiness` job** | Single readable answer: red **only** for a genuine failure; an absent credential is reported as `RELEASE BLOCKED` with the exact secret names (`PHASE3-RELEASE-BLOCKED-*`), never as a build error and never as a fabricated "signed" release. |
| **`native-tests`** | Now also runs `node scripts/auto-fix.mjs --check` and the full `tools/*.mjs` suite. |

`release.yml` was aligned: the iOS staging step accepts the real `.ipa` **or**
the real unsigned `.xcarchive.zip`, verifies every `.ipa` is Mach-O, and the
delivery gate now counts `IPA + xcarchive` and emits
`RELEASE-IOS-UNSIGNED` when only the archive exists.

---

## 3. `scripts/auto-fix.mjs` — the local self-healing audit

```bash
node scripts/auto-fix.mjs            # scan + repair
node scripts/auto-fix.mjs --apply    # same, explicit
node scripts/auto-fix.mjs --check    # fail-closed (exit 1 on any blocking finding)
node scripts/auto-fix.mjs --json     # machine-readable report
```

Rules (each one maps to a defect that has already broken CI):

| Rule | Behaviour |
|---|---|
| `xcodebuild-quoted-options` | Repairs `xcodebuild "$OPTS"` → real bash array (skips strings with quotes/substitutions — those are reported for a human, never guessed). |
| `fabricated-ipa-executable` | Replaces a synthesized shell-script app executable with a fail-closed error (consumes multi-line `echo` continuations). |
| `hardcoded-xcodeproj` | Reports `-project X.xcodeproj` when `project.yml` says otherwise (documentation/comment lines ignored). |
| `missing-diagnostic-log` | Inserts `: > "<log>"` before the first `exit 1` when a diagnostics log could be lost. |
| `tauri-icon-rgba` | Converts non-RGBA Tauri icons to PNG colour type 6 **losslessly** (zlib inflate → insert opaque alpha → deflate → CRC32 recomputed; pixel-exact, verified). |
| `go-pseudo-version` | Reports truncated Go pseudo-versions (needs network to resolve — never auto-edited). |
| `workflow-hygiene` | Normalises trailing whitespace / tab indentation / line endings. |
| `shell-syntax` | `bash -n` over `scripts/**` and `universal-core/**`. |

Donor trees (`MICAFP`, `MSN-GUARD`, `EasySNI`, `MasterDnsVPN`, `UAC-SNI-*`) are
**reported but never modified**: findings there are `INFO`, not blocking, so the
preserved sources stay byte-for-byte intact.

## 4. `tools/auto_fix_regression_gate.mjs` — the anti-regression lock

Fail-closed gate (now 29/29 gates pass) asserting: the checker exists with a
`--check` mode and reports PASS; CI runs it in both `universal-core-ci.yml` and
`vor-native-phase3.yml`; `scripts/ios-packaging.sh` keeps `ios_verify_ipa`,
`ios_verify_app_bundle`, `ios_is_macho`, `ios_resolve_xcodeproj` and never
synthesizes an executable; both `.ipa` entry points use the shared helper; and
the pipeline stays signing-plan driven with the argv defect fixed.

---

## 5. Validation

```bash
for gate in tools/*.mjs; do node "$gate"; done   # 29/29 PASS
node scripts/auto-fix.mjs --check                # PASS — no known defects
bash -n scripts/ios-packaging.sh scripts/build-ios-ipa.sh \
         scripts/build-release-artifacts.sh universal-core/apple/build-ipa.sh
python3 -c "import yaml;[yaml.safe_load(open(f)) for f in ['.github/workflows/vor-native-phase3.yml','.github/workflows/release.yml','.github/workflows/universal-core-ci.yml']]"
```

Repair proof (defect injected into a scratch script, then auto-repaired):

```
FIX  [xcodebuild-quoted-options] converted "$OPTS" into a real bash array (OPTS_ARGS)
FIX  [fabricated-ipa-executable] replaced the synthesized shell-script executable with a fail-closed error
```

RGBA conversion proof: a 3×2 RGB PNG was converted to colour type 6 with
`rawLen == h*(w*4+1)` and pixels preserved exactly (`(2,1) → 13,20,30,255`).

## 6. Explicitly not removed

* Both `.ipa` entry points (`scripts/build-ios-ipa.sh`,
  `universal-core/apple/build-ipa.sh`) still exist and still build.
* Unsigned / ad-hoc archives remain a first-class output.
* The strict fail-closed signing behaviour is preserved as
  `on_missing_signing=fail`.
* Every donor tree, capability, gate and artifact type is untouched.
