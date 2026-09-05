# Milestone 70 — The pipeline now proves what Gradle will do: alias, key
# password and certificate-vs-key are validated (and safely auto-corrected)
# BEFORE a single build minute is spent

**Date:** 2026-09-05 · **Branch:** `arena/01a071f4-v2rayez` · **PR:** #15
**Goal:** root-cause the red `build-android` the user captured in a screenshot
(Gradle died with `KeytoolException`), fix it completely, automatically and
intelligently — removing nothing.

## What the magnifying-glass pass found

Decoded `PHASE3-DIAG-ANDROID-B64-*` from cancelled run `33974072492` (old
`main`, before the PR — the pipeline was still the raw `echo | base64 -d`):

```
com.android.ide.common.signing.KeytoolException: No key with alias 'vor'
found in keystore /home/runner/work/V2RayEZ/V2RayEZ/vor-release.keystore
```

And the user's newest screenshot (run `33974841906`) shows the other classic:

```
KeytoolException: Failed to read key *** from store "…/vor-release.keystore":
keystore password was incorrect
Caused by: UnrecoverableKeyException: Failed to decrypt safe contents entry:
javax.crypto.BadPaddingException: Given final block not properly padded
```

So the operator's `VOR_ANDROID_*` secrets are present but **mismatched with
the uploaded keystore** (alias name, and/or passwords). Milestone 69's
validation ladder proved the *store* password and alias *presence* — but had
two blind spots that would still let Gradle be the first to discover a defect:

1. **alias presence ≠ alias correctness path** — a missing alias in a
   single-entry keystore should auto-resolve (that single key IS the operator's
   release key), and a missing alias in a multi-entry keystore must list every
   available alias.
2. **the KEY password was never proven** — `keytool -list` only needs the store
   password, so a key that Gradle could not decrypt still passed validation.

Measured JDK behaviour on real keystores (this shaped the design):

| keystore type | wrong `VOR_ANDROID_KEY_PASSWORD` secret | real-world effect |
|---|---|---|
| PKCS12 | JDK **ignores** it and normalises to the store password (`Ignoring user-specified -srckeypass value`) | Gradle still signs — no failure |
| JKS, keypass == storepass | strict → key unreadable with the wrong secret | Gradle `BadPadding` unless the store password is substituted |
| JKS, keypass ≠ storepass | strict; only the true keypass works | Gradle `BadPadding` unless the exact secret is fixed |
| certificate-only store (`.cer` exported, not the keystore) | alias resolves but is `trustedCertEntry` | Gradle: "not a PrivateKeyEntry" |

## The fix — validation ladder v1.1.0 (`scripts/materialize-keystore.sh`)

Each rung **adds** proof; every existing behaviour is preserved:

1. magic bytes (unchanged);
2. store-password proof via `keytool -list` (unchanged, sharper reason);
3. **alias resolution (new)**: configured alias found → use it; not found but
   the keystore carries EXACTLY ONE entry → auto-resolve to it (same key
   identity — only the label is corrected) with a loud
   `PHASE3-ALIAS-AUTO-RESOLVED` warning; multiple entries → rc3 listing every
   available alias (never guesses between identities);
4. **entry-type check (new)**: a `trustedCertEntry` resolves to a precise
   "you uploaded a CERTIFICATE, not a keystore" error;
5. **key-decryption proof (new)**: a real `keytool -importkeystore` round-trip
   on a scratch keystore — exactly the decryption Gradle performs:
   * configured key password opens the key → use as-is;
   * the STORE password opens the key → auto-correct
     (`VOR_KEY_PASSWORD_EFFECTIVE`) with `PHASE3-KEY-PASSWORD-AUTO-CORRECTED`;
   * neither opens it → rc1 with the exact defect and the exact repair.

Corrections travel through password-safe heredoc `GITHUB_ENV` exports
(`VOR_ALIAS_EFFECTIVE`, `VOR_KEY_PASSWORD_EFFECTIVE`) consumed by the Gradle
step and the apksigner step via `${{ env.VOR_… || secrets.VOR_… }}` — so an
imperfect secret no longer reaches Gradle at all, and **the same real key
signs the release**.

## Intelligence upgrades

* `signing-plan` now installs a JDK and runs the FULL ladder against the
  operator's real secrets — the run summary names alias/key defects
  *before any build starts*.
* `signing-plan` validates the KEY password (not just presence).
* Diagnostics expose `KEY_PASSWORD_PRESENT`, `ALIAS_EFFECTIVE_SET`,
  `KEY_PASSWORD_EFFECTIVE_SET`.
* `fail` mode stays a hard gate, now naming the exact rung that failed;
  `report` mode auto-recovers to the honest unsigned build.

## Anti-regression lock

`tools/keystore_materialization_gate.mjs` section 7 pins: the
`importkeystore` probe, both override channels, the cert check, the
multi-alias listing, JDK in `signing-plan`, the 5-argument helper calls, the
heredoc exports, the `|| secrets` fallback wiring in both Gradle and apksigner
steps, and the new diagnostics.

## Validation (all executed for real)

* Self-test grown to **27 checks** — now includes: PKCS12 keypass
  normalisation by the JDK, JKS distinct-keypass accept **and** precise
  rejection, JKS wrong-alias auto-resolve, JKS wrong-keypass auto-correct,
  certificate-only rejection (JDK prints `trustedCertEntry` lower-case — bug
  found and fixed by this very test), multi-alias rc3 listing both names.
  30/30 consecutive runs PASS with a real JDK (jdk4py JRE); 17/17 in
  keytool-less environments.
* **Dress rehearsal of the exact step code — 8/8 scenarios**:
  alias-`vor`-missing single-entry → AUTO-RESOLVED + exported ✓ · JKS wrong
  key-password → AUTO-CORRECTED ✓ · undecryptable key + report → honest
  fallback ✓ · + fail → precise exit 1 ✓ · wrong store password + report →
  fallback ✓ · + fail → precise exit 1 ✓ · no secret → unchanged ✓ ·
  everything correct + fail → signs cleanly ✓
* 30/30 repo gates PASS · `auto-fix --check` PASS · `bash -n` PASS ·
  workflow YAML parses.

## Explicitly not removed

* `on_missing_signing=fail` hard gate — untouched.
* Both iOS entry points, unsigned `.xcarchive`, `.apk`/`.aab` structural
  verification, OpenWrt SDK builds, desktop bundles, `release.yml` behaviour —
  untouched (`release.yml` never consumes these secrets; it generates its own
  keystore).
* No donor tree, job, gate or artifact type dropped.
