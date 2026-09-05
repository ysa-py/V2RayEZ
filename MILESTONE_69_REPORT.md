# Milestone 69 — The keystore secret itself is now self-healing: real Android
# signing works with imperfect operator input, and the pipeline explains itself

**Date:** 2026-09-05 · **Branch:** `arena/01a071f4-v2rayez`
**Goal:** the "magnifying glass" pass over the red `workflow_dispatch` run
`33971338723` — find the *real* error behind `build-android`'s exit 1, fix it
completely, make the whole pipeline automatic and intelligent, and remove
nothing.

Everything below is additive. No capability, artifact type, strict gate, job,
FFI symbol or donor tree was removed. The explicit `on_missing_signing=fail`
hard release gate is preserved verbatim.

## Result

| Finding | Verdict |
|---|---|
| `build-openwrt` ×2, `build-desktop` ×3 (win/mac/linux), `native-tests`, `meta`, `signing-plan` | ✅ **already green** on run `33971338723` |
| `build-android` — `Materialize release keystore` | ❌ **real defect** (D1 below) — fixed |
| `build-ios` | ✅ behaved exactly as designed: the caller chose `signed=true` + `on_missing_signing=fail` with no Apple credentials; the strict gate fired by choice |
| `release-readiness` | now tells those two cases apart loudly |

## D1 — A present-but-imperfect keystore secret killed the build

`build-android` did:

```bash
echo "$ANDROID_KEYSTORE_B64" | base64 -d > vor-release.keystore
```

with `set -euo pipefail`. The diagnostics proved the secret **was present**
(`PHASE3-DIAG-ANDROID-SIGN-KEYSTORE_B64_PRESENT=true`), so the only possible
failure was the decode itself. Measured on real GNU coreutils:

* a trailing `\r` (Windows clipboard / `certutil`) → `base64: invalid input`, exit 1
* spaces / tabs from copy-paste wrapping → exit 1
* `-----BEGIN CERTIFICATE-----` armour → exit 1
* literal `\n` escape sequences (double-encoded JSON) → exit 1

So the very first run with real Android credentials went red on a *formatting
quirk of the operator's clipboard* — with no message naming the cause.

### The fix — `scripts/materialize-keystore.sh` (shared, self-healing)

One helper, used by every keystore consumer:

1. **Normalise**: data-URI prefixes, PEM armour, literal escape sequences
   (`\\n` before `\n`, looped until stable so a legitimate payload `n` after
   an escape can never be eaten), all whitespace/CR, stray quotes, URL-safe
   alphabet (`-`/`_` → `+/`, only when unambiguous), a final
   **base64-alphabet filter** (a stray backslash is pollution by definition —
   GNU `base64 -i` alone still fails when mid-stream garbage leaves an
   unpadded remainder), and missing `=` padding.
2. **Decode with a magic-driven oracle**: a pure-hex keystore is *also* valid
   base64 (of its own hex text), so "first decoder wins" silently decodes
   garbage. Every candidate (strict b64, hex, ignore-garbage) must prove the
   **keystore magic** (`FE ED FE ED` JKS / `30 82…` PKCS12 / BKS) before it is
   accepted.
3. **Prove identity**: `keytool -list` with the operator's password and alias
   (where a JDK exists) distinguishes *wrong password* from *wrong alias*
   (which reports the aliases that DO exist) from *not a keystore at all*.
4. **Report precisely, decide by plan**: `report` mode falls back to the CI
   debug keystore with an honest `PHASE3-KEYSTORE-MATERIALIZATION-FALLBACK`
   warning + `SIGNING-STATUS.txt`; `fail` mode keeps the hard gate but now
   names the exact defect and the exact repair command
   (`base64 -w0 vor-release.keystore`).

Offline proof suite (`bash scripts/materialize-keystore.sh --self-test`)
exercises 12 byte-exact recovery scenarios (clean, CRLF, LF-wrap, spaces, PEM,
literal `\n`, URL-safe, data-URI, missing padding, hex, upper-hex, quoted) +
3 precise rejections; **30/30 consecutive runs PASS** (the flaky intermediate
version was fixed before landing — see the history of this milestone in git).

## The intelligence upgrades

| Where | What changed |
|---|---|
| `signing-plan` | now **validates material, not just presence**: decodes + magic-checks the keystore and the provisioning profile, shape-checks `APPLE_TEAM_ID`; publishes `android_material` / `ios_material` (`ok: …` / `suspect: <precise reason>` / `absent`) into outputs, the JSON plan and the summary table, plus `PHASE3-SIGNING-PLAN-*-MATERIAL` annotations. A bad secret is named **before any build minute is spent**. |
| summary "Smart plan" | the plan job now states the effective outcome up front: *all material validated → fully signed release*, or *missing material + `report` → strongest real unsigned artifact automatically*, or *missing material + `fail` → this run goes red on purpose*. |
| `Sign / verify` step | reuses the helper; an unusable secret in `report` mode now ships the real UNSIGNED artifacts instead of dying mid-step (`PHASE3-SIGNING-MATERIAL-UNUSABLE`); in `fail` mode the precise reason still fail-closes. |
| `release-readiness` | distinguishes a **genuine build failure** from a run that is *red by the caller's explicit strict choice*, and prints the exact missing secret names plus the one-input automatic alternative. |
| Materialize step | fail-closed in `fail` mode, honest debug-keystore fallback in `report` mode — both paths verified. |

## The anti-regression lock

New gate `tools/keystore_materialization_gate.mjs` (30 gates total now):

* **executes** the helper's self-test for real (not mocked) and requires
  `FAIL=0`;
* pins every normalisation marker (CR, PEM, literal `\n`, URL-safe, data-URI,
  padding, hex, magic-driven selection);
* pins the workflow wiring: both keystore steps must call
  `vor_materialize_keystore`, no raw `| base64 -d >` keystore decode may
  return, the iOS profile decode must normalise and tolerate failure;
* pins capability preservation: the strict `on_missing_signing=fail` branch,
  the honest report-mode fallback, and the explicit-choice explainer.

## Validation

```bash
for gate in tools/*.mjs; do node "$gate"; done   # 30/30 PASS
node scripts/auto-fix.mjs --check                # PASS
bash -n scripts/materialize-keystore.sh          # PASS
bash scripts/materialize-keystore.sh --self-test # PASS (30/30 consecutive)
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/vor-native-phase3.yml'))"
```

## Explicitly not removed

* `on_missing_signing=fail` hard release gate — untouched and still selectable.
* Both iOS entry points, the unsigned `.xcarchive` path, Android `.apk`/`.aab`
  structural verification, OpenWrt SDK builds, desktop bundles — all unchanged.
* No donor tree touched; no feature, job or artifact type dropped.
