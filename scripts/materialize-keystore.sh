#!/usr/bin/env bash
# Vor — intelligent, self-healing release-keystore materialization.
#
# WHY THIS EXISTS (real defect, run 33971338723, job build-android, step
# "Materialize release keystore"): the old step did
#
#     echo "$ANDROID_KEYSTORE_B64" | base64 -d > vor-release.keystore
#
# which died with a bare `exit 1` the moment the operator-supplied secret was
# not byte-perfect canonical base64. Real-world secrets routinely carry:
#   * CRLF line wraps        (Windows clipboards, `certutil -encode`)
#   * PEM armour headers     (`-----BEGIN CERTIFICATE-----`)
#   * literal "\n" escapes   (double-encoded by JSON/tooling)
#   * spaces / tabs          (copy-paste wrapping)
#   * URL-safe alphabet      (`-`/`_` from JWT-style encoders)
#   * data-URI prefixes      (`data/application-x-pkcs12;base64,…`)
#   * missing '=' padding
#   * hex encoding           (someone ran xxd instead of base64)
# A good secret must never red-light a pipeline with a cryptic exit code: it
# should be normalised, decoded, VALIDATED, and either used or reported with a
# PRECISE, human-readable reason. That is what this helper does.
#
# NOTHING IS REMOVED: the strict `on_missing_signing=fail` release gate is
# preserved — callers still decide fail vs. report. This helper only makes the
# decision an INFORMED one.
#
# Public API (source this file; safe under `set -euo pipefail` callers):
#   vor_normalize_b64 <raw>                          # → VOR_B64_NORMALIZED, VOR_B64_NOTES
#   vor_decode_keystore_material <raw> <outfile>     # rc0 + VOR_DECODE_VERDICT | rc1 + VOR_DECODE_REASON
#   vor_verify_keystore_file <file> [pass] [alias] [keypass]
#                                                    # rc0 ok / rc3 alias-unresolvable /
#                                                    # rc1 + VOR_KS_REASON, VOR_KS_TYPE,
#                                                    # VOR_ALIAS_EFFECTIVE, VOR_KEY_PASSWORD_EFFECTIVE
#   vor_materialize_keystore <raw> <out> [pass] [alias] [keypass]
#                                                    # rc0 ok | rc3 | rc1 + VOR_MATERIALIZATION_VERDICT
#
# Execute directly for the offline proof-suite:
#   bash scripts/materialize-keystore.sh --self-test
#
# The helper never prints secret material — diagnostics carry only lengths,
# magic bytes and symbol classes.

# Guard against double-sourcing side effects; nothing here runs on source.
VOR_KS_HELPER_VERSION="1.1.0"
VOR_B64_NOTES=""
VOR_DECODE_VERDICT=""
VOR_DECODE_REASON=""
VOR_KS_REASON=""
VOR_KS_TYPE=""
# Effective signing material (empty = use the configured secret as-is):
VOR_ALIAS_EFFECTIVE=""
VOR_KEY_PASSWORD_EFFECTIVE=""

# ─────────────────────────────────────────────────────────────────────────────
# Normalise an operator-supplied base64 secret to canonical standard base64.
# Results are returned in GLOBALS so they survive command substitution:
#   VOR_B64_NORMALIZED — the canonical base64 payload
#   VOR_B64_NOTES      — space-separated, log-safe list of applied repairs
# (A subshell `norm="$(vor_normalize_b64 …)"` would silently discard the
#  notes — the very failure this helper exists to prevent.)
# ─────────────────────────────────────────────────────────────────────────────
vor_normalize_b64() {
  local raw="$1"
  local s="$raw"
  local notes=()
  VOR_B64_NOTES=""
  VOR_B64_NORMALIZED=""

  # data-URI prefix: data:<anything>;base64,<payload>
  if [[ "$s" == data:*base64,* ]]; then
    s="${s#*,}"
    notes+=("stripped data-URI prefix")
  fi

  # PEM armour: -----BEGIN X----- / -----END X----- (incl. blank lines around)
  if [[ "$s" == *'-----BEGIN'* || "$s" == *'-----END'* ]]; then
    s="$(printf '%s' "$s" | sed -e 's/-----BEGIN [A-Za-z0-9 ]*-----//g' \
                                -e 's/-----END [A-Za-z0-9 ]*-----//g')"
    notes+=("stripped PEM armour headers")
  fi

  # Literal escape sequences (single- and double-encoded "\n", "\\n", …).
  # The escaped-backslash forms are removed FIRST and the strip loops until
  # stable: a single left-to-right pass would otherwise consume a legitimate
  # payload 'n' that follows an escape sequence ("\\n" + "n…").
  if [[ "$s" == *'\'* ]]; then
    local before="" next
    while [[ "$s" != "$before" ]]; do
      before="$s"
      next="${s//\\\\n/}"; s="$next" # \\n (double-encoded)
      next="${s//\\\\r/}"; s="$next" # \\r
      next="${s//\\\\t/}"; s="$next" # \\t
      next="${s//\\n/}"; s="$next"   # \n
      next="${s//\\r/}"; s="$next"   # \r
      next="${s//\\t/}"; s="$next"   # \t
    done
    notes+=("stripped literal backslash escapes")
  fi

  # Every whitespace character: spaces, tabs, CR, LF, FF, VT.
  # (CR is the classic Windows-clipboard killer of `base64 -d`.)
  # NOTE: grep can never see a trailing/LF newline (it treats them as line
  # separators), so detection is done by comparing the tr output itself.
  local stripped
  stripped="$(printf '%s' "$s" | tr -d ' \t\r\n\f\v')"
  if [[ "$stripped" != "$s" ]]; then
    if printf '%s' "$s" | grep -q $'\r'; then
      notes+=("stripped CR/whitespace/line-wraps (CRLF-safe)")
    else
      notes+=("stripped whitespace/line-wraps")
    fi
    s="$stripped"
  fi

  # Stray quoting someone wrapped around the value.
  if [[ "$s" == *'"'* || "$s" == *"'"* ]]; then
    s="${s//\"/}"
    s="${s//\'/}"
    notes+=("stripped quote characters")
  fi

  # URL-safe base64 alphabet → standard. Only applied when the payload could
  # NOT be standard base64 (contains -/_ but no +/), so a legitimate '+'
  # payload is never corrupted.
  if [[ "$s" == *[-_]* && "$s" != *'+'* && "$s" != *'/'* ]]; then
    s="${s//-/+}"
    s="${s//_//}"
    notes+=("URL-safe alphabet mapped to standard")
  fi

  # Alphabet filter: keep ONLY [A-Za-z0-9+/=]. Everything else (stray
  # backslashes, markdown artifacts, invisible control chars) is pollution by
  # definition. This is what makes the decode deterministic — GNU base64 -i
  # alone still fails when mid-stream garbage leaves an unpadded remainder.
  local filtered
  filtered="$(printf '%s' "$s" | tr -cd 'A-Za-z0-9+/=')"
  if [[ "$filtered" != "$s" ]]; then
    notes+=("filtered to the base64 alphabet")
    s="$filtered"
  fi

  # Hex detection is done by the decoder (needs a decode attempt to decide).

  # Missing '=' padding (only when none present — never double-pad).
  if [[ -n "$s" && "$s" != *'='* ]]; then
    local len pad
    len="${#s}"
    pad=$(( (4 - len % 4) % 4 ))
    if (( pad > 0 )); then
      local p="" i
      for ((i = 0; i < pad; i++)); do p+="="; done
      s="$s$p"
      notes+=("added ${pad} missing '=' pad")
    fi
  fi

  VOR_B64_NOTES="${notes[*]:-}"
  VOR_B64_NORMALIZED="$s"
  return 0
}

# Log-safe character-class summary of what made an input undecodable.
vor_undecodable_symbols() {
  local s="$1"
  local bad
  bad="$(printf '%s' "$s" | tr -d 'A-Za-z0-9+/=' | fold -w1 | sort -u | tr -d '\n' | head -c 24)"
  if [[ -n "$bad" ]]; then
    printf 'non-base64 symbols present: %s' "$bad"
  else
    printf 'length=%s is not a valid base64 frame' "${#s}"
  fi
}

# Hex decode via pure parameter expansion — no IFS/`read` word-splitting
# dependence, no trailing-newline edge cases, no xxd requirement.
vor_hex_decode() {
  local hex="$1" i pair
  for ((i = 0; i < ${#hex}; i += 2)); do
    pair="${hex:i:2}"
    printf "\\x$pair"
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# Decode operator material into <outfile>. rc 0 = decoded to bytes.
# Sets VOR_DECODE_VERDICT (repairs applied) or VOR_DECODE_REASON (precise).
# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
# Decode operator material into <outfile>. rc 0 = decoded to plausible
# keystore bytes (magic-verified), rc 1 = unusable (precise reason).
# Sets VOR_DECODE_VERDICT (repairs applied) or VOR_DECODE_REASON (precise).
#
# Selection is MAGIC-DRIVEN, not order-driven: a hex-encoded keystore is also
# valid base64 (of the hex TEXT), so "first decoder wins" would silently
# decode garbage. Every candidate decode must prove the keystore magic before
# it is accepted.
# ─────────────────────────────────────────────────────────────────────────────
vor_decode_keystore_material() {
  local raw="$1" outfile="$2"
  VOR_DECODE_VERDICT=""
  VOR_DECODE_REASON=""

  vor_normalize_b64 "$raw"
  local norm="$VOR_B64_NORMALIZED"
  local notes="$VOR_B64_NOTES"

  if [[ -z "$norm" ]]; then
    VOR_DECODE_REASON="material is empty (after normalisation)"
    return 1
  fi

  local tmpc rc=0 magic_bad=""
  tmpc="$outfile.candidate"
  _magic_ok() { # file → rc0 when the bytes carry a keystore magic
    vor_verify_keystore_file "$1" "" "" >/dev/null 2>&1
  }

  # Candidate A: strict canonical decode of the normalised payload.
  if printf '%s' "$norm" | base64 -d > "$tmpc" 2>/dev/null && [[ -s "$tmpc" ]]; then
    if _magic_ok "$tmpc"; then
      mv -f "$tmpc" "$outfile"
      VOR_DECODE_VERDICT="${notes:+recovered(${notes}; )}decoded $(wc -c < "$outfile" | tr -d ' ') bytes"
      return 0
    fi
    magic_bad="$(head -c 4 "$tmpc" | od -An -tx1 | tr -d ' \n')"
  fi

  # Candidate B: hex-encoded payload (xxd-style operator mistake). A pure-hex
  # string is ALSO valid base64 (of the hex text), so this is checked
  # explicitly and decided by the keystore magic, never by ordering luck.
  # Trailing '=' is ignored: the normalizer may have added base64 padding.
  local hextry
  hextry="$(printf '%s' "$norm" | tr -d '=')"
  if [[ "$hextry" =~ ^[0-9A-Fa-f]+$ ]] && (( ${#hextry} % 2 == 0 )); then
    if vor_hex_decode "$hextry" > "$tmpc" 2>/dev/null && [[ -s "$tmpc" ]]; then
      if _magic_ok "$tmpc"; then
        mv -f "$tmpc" "$outfile"
        VOR_DECODE_VERDICT="recovered(input was hex-encoded, not base64); decoded $(wc -c < "$outfile" | tr -d ' ') bytes"
        return 0
      fi
    fi
  fi

  # Candidate C: ignore-garbage decode. NEVER trusted on its own — accepted
  # only when the keystore magic proves the identity of the payload.
  if printf '%s' "$norm" | base64 -di > "$tmpc" 2>/dev/null && [[ -s "$tmpc" ]]; then
    if _magic_ok "$tmpc"; then
      mv -f "$tmpc" "$outfile"
      VOR_DECODE_VERDICT="recovered(base64 ignore-garbage; identity proven by keystore magic); decoded $(wc -c < "$outfile" | tr -d ' ') bytes"
      return 0
    fi
  fi

  rm -f "$tmpc"
  if [[ -n "$magic_bad" ]]; then
    VOR_DECODE_REASON="base64 decodes cleanly but the payload is NOT a keystore (first4=${magic_bad:-<empty>}) — check that the secret is the base64 of the keystore file itself"
  else
    VOR_DECODE_REASON="not decodable as base64 (nor hex) even after normalisation; $(vor_undecodable_symbols "$norm")"
  fi
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Prove a decoded file really is a usable keystore.
#   rc 0 = proven (+ keytool password/alias/KEY proofs when keytool+creds exist)
#   rc 3 = container valid but the alias cannot be resolved safely
#   rc 1 = not a keystore / wrong password / key won't open — VOR_KS_REASON why
#
# Milestone-70 ladder (each rung ADDS proof, nothing is removed):
#   1. magic bytes (JKS/PKCS12/BKS);
#   2. keytool -list with the store password          → store proof;
#   3. alias resolution:
#        configured alias found        → use it;
#        not found + EXACTLY ONE alias → auto-resolve (that key IS the
#                                        user's release key — same identity,
#                                        never a different one) + note;
#        not found + multiple aliases  → rc3, list every available alias;
#   4. entry-type check: the resolved alias must be a PrivateKeyEntry — a
#      trustedCertEntry (JDK prints it lower-case; older JDKs
#      TrustedCertificateEntry) means the user exported a CERT, not a key;
#   5. KEY proof via a real keytool -importkeystore round-trip (exactly the
#      decryption Gradle performs):
#        configured key password opens the key → use as-is;
#        the STORE password opens the key      → auto-correct
#                                 (VOR_KEY_PASSWORD_EFFECTIVE) + note;
#        neither opens it                      → rc1, precise.
# Results: VOR_KS_TYPE, VOR_KS_REASON, VOR_ALIAS_EFFECTIVE, VOR_KEY_PASSWORD_EFFECTIVE.
# ─────────────────────────────────────────────────────────────────────────────
vor_verify_keystore_file() {
  local file="$1" storepass="${2:-}" alias="${3:-}" keypass="${4:-}"
  VOR_KS_REASON=""
  VOR_KS_TYPE=""
  VOR_ALIAS_EFFECTIVE=""
  VOR_KEY_PASSWORD_EFFECTIVE=""

  [[ -s "$file" ]] || { VOR_KS_REASON="decoded file is empty"; return 1; }

  local magic size
  magic="$(head -c 4 "$file" | od -An -tx1 | tr -d ' \n')"
  size="$(wc -c < "$file" | tr -d ' ')"
  case "$magic" in
    feedfeed)            VOR_KS_TYPE="JKS" ;;
    cececece)            VOR_KS_TYPE="BKS" ;;
    3082*|3081*|3072*)   VOR_KS_TYPE="PKCS12" ;;
    *)                   VOR_KS_REASON="decoded bytes are NOT a keystore (first4=${magic:-<empty>}, size=${size} bytes) — the secret payload is not a keystore file"; return 1 ;;
  esac

  # Full cryptographic proof when a JDK is present (CI build jobs have one).
  if command -v keytool >/dev/null 2>&1 && [[ -n "$storepass" ]]; then
    local out rc=0
    out="$(keytool -list -keystore "$file" -storepass "$storepass" 2>&1)" || rc=$?
    if (( rc != 0 )); then
      if grep -qi "password" <<<"$out"; then
        VOR_KS_REASON="keystore decoded ($VOR_KS_TYPE, ${size} bytes) but the STORE password was REJECTED by keytool — the password secret does not open this keystore"
      else
        local line
        line="$(grep -m1 -iE 'exception|error' <<<"$out" | head -c 200)"
        VOR_KS_REASON="keystore magic is $VOR_KS_TYPE but keytool rejected it${line:+: ${line}}"
      fi
      return 1
    fi

    # ── alias resolution ────────────────────────────────────────────────────
    local aliases_flat entry_count=0 line_a
    aliases_flat="$(
      LC_ALL=C grep -E '^[^ ].+, [A-Z][a-z][a-z] [0-9]{1,2}, [0-9]{4}, ' <<<"$out" \
        | sed -E 's/^([^,]+), .*/\1/'
    )"
    entry_count="$(LC_ALL=C grep -cE '^[^ ].+, [A-Z][a-z][a-z] [0-9]{1,2}, [0-9]{4}, ' <<<"$out" || true)"

    if [[ -n "$alias" ]]; then
      local alias_re
      alias_re="$(printf '%s' "$alias" | sed 's/[][\.*^$()+?{|]/\\&/g')"
      if LC_ALL=C grep -qE "(^|[[:space:],])${alias_re}, " <<<"$out"; then
        VOR_ALIAS_EFFECTIVE="$alias"
      elif [[ "$entry_count" == "1" ]]; then
        # Same-key auto-resolve: the keystore carries exactly one entry and the
        # configured alias does not exist in it. The single key IS the release
        # key the operator uploaded — switching the LABEL is not an identity
        # change. The caller emits a loud warning.
        VOR_ALIAS_EFFECTIVE="$(printf '%s' "$aliases_flat" | head -n1 | tr -d '[:space:]')"
        VOR_KS_TYPE="${VOR_KS_TYPE}+alias-auto-resolved(${VOR_ALIAS_EFFECTIVE})"
      else
        VOR_KS_REASON="keystore is valid ($VOR_KS_TYPE) but alias '${alias}' is not in it${aliases_flat:+; available aliases: $(printf '%s' "$aliases_flat" | tr '\n' ' ')}"
        return 3
      fi
    fi

    # ── entry-type check: a certificate is not a signing key ───────────────
    if [[ -n "${VOR_ALIAS_EFFECTIVE:-}" ]]; then
      local eff_re entry_line
      eff_re="$(printf '%s' "$VOR_ALIAS_EFFECTIVE" | sed 's/[][\.*^$()+?{|]/\\&/g')"
      entry_line="$(LC_ALL=C grep -E '^[^ ].+, [A-Z][a-z][a-z] [0-9]{1,2}, [0-9]{4}, ' <<<"$out" \
        | grep -E "(^|[[:space:],])${eff_re}, " | head -n1)"
      if grep -qiE 'trustedcertentry' <<<"$entry_line"; then
        VOR_KS_REASON="alias '${VOR_ALIAS_EFFECTIVE}' resolves to a trustedCertEntry — this file holds a CERTIFICATE, not a signing key. Upload the keystore itself (the .jks/.p12 that was generated with the keypair), not an exported certificate"
        return 1
      fi
    fi

    # ── KEY proof: a real importkeystore round-trip (what Gradle decrypts) ──
    if [[ -n "${VOR_ALIAS_EFFECTIVE:-}" && -n "$keypass" ]]; then
      local scratch proof_rc rand
      _keyprobe() { # srckeypass → rc0 when the key decrypts
        scratch="$(mktemp -d)"
        rand="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        keytool -importkeystore -noprompt \
          -srckeystore "$file" -srcstorepass "$storepass" -srckeypass "$1" \
          -srcalias "$VOR_ALIAS_EFFECTIVE" \
          -destkeystore "$scratch/probe.p12" -deststoretype PKCS12 \
          -deststorepass "$rand" -destkeypass "$rand" >/dev/null 2>&1
        local _rc=$?
        rm -rf "$scratch"
        return $_rc
      }
      if _keyprobe "$keypass"; then
        VOR_KS_TYPE="${VOR_KS_TYPE}+key-verified"
      elif _keyprobe "$storepass"; then
        # The overwhelmingly common real-world configuration: one password for
        # everything. Same key, same identity — only the secret was mistyped.
        VOR_KEY_PASSWORD_EFFECTIVE="$storepass"
        VOR_KS_TYPE="${VOR_KS_TYPE}+key-password-auto-corrected"
      else
        VOR_KS_REASON="store password opens the keystore ($VOR_KS_TYPE) and alias '${VOR_ALIAS_EFFECTIVE}' exists, but the KEY entry cannot be decrypted: neither the key-password secret nor the store password unlocks key '${VOR_ALIAS_EFFECTIVE}' (BadPadding) — fix the key-password secret or re-export the keystore with matching passwords"
        return 1
      fi
    fi
    VOR_KS_TYPE="${VOR_KS_TYPE}+keytool-verified"
  fi
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# One-call materialization: decode + validate.
#   vor_materialize_keystore <raw> <out> [storepass] [alias] [keypass]
#   rc 0 → VOR_MATERIALIZATION_VERDICT="ok; …" and <out> is a proven keystore;
#          VOR_ALIAS_EFFECTIVE / VOR_KEY_PASSWORD_EFFECTIVE are set when the
#          pipeline should sign with a corrected (auto-resolved) label/password
#   rc 3 → container valid, alias unresolvable (verdict precise)
#   rc 1 → unusable material (VOR_MATERIALIZATION_VERDICT precise)
# ─────────────────────────────────────────────────────────────────────────────
vor_materialize_keystore() {
  local raw="$1" out="$2" storepass="${3:-}" alias="${4:-}" keypass="${5:-}"
  VOR_ALIAS_EFFECTIVE=""
  VOR_KEY_PASSWORD_EFFECTIVE=""
  if vor_decode_keystore_material "$raw" "$out"; then
    local rc=0
    vor_verify_keystore_file "$out" "$storepass" "$alias" "$keypass" || rc=$?
    if (( rc == 0 )); then
      VOR_MATERIALIZATION_VERDICT="ok; ${VOR_DECODE_VERDICT}; type=${VOR_KS_TYPE}"
      return 0
    fi
    VOR_MATERIALIZATION_VERDICT="invalid: ${VOR_KS_REASON}"
    return "$rc"
  fi
  VOR_MATERIALIZATION_VERDICT="invalid: ${VOR_DECODE_REASON}"
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Offline proof suite — real execution, no mocks. Exit 0 only if every
# malformation below is repaired byte-exactly and every bad input is rejected
# with a precise reason.
# ─────────────────────────────────────────────────────────────────────────────
vor_keystore_selftest() {
  set -u
  local tmp rc failures=0 pass=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  # A synthetic keystore-like payload with a real JKS magic.
  local orig="$tmp/orig.jks"
  { printf '\xfe\xed\xfe\xed'; head -c 596 /dev/urandom; } > "$orig"
  local b64
  b64="$(base64 -w0 "$orig")"

  _check() { # name expected_rc actual_rc [byte-compare file]
    local name="$1" erc="$2" arc="$3" cmpfile="${4:-}"
    if (( erc != arc )); then
      echo "FAIL  $name: expected rc=$erc got rc=$arc"; failures=$((failures + 1)); return
    fi
    if [[ -n "$cmpfile" ]] && ! cmp -s "$orig" "$cmpfile"; then
      echo "FAIL  $name: decoded bytes differ from original"; failures=$((failures + 1)); return
    fi
    pass=$((pass + 1))
  }

  # ── positive matrix: every real-world malformation must self-heal ──
  local n=0
  local variants=(
    "clean|$(printf '%s' "$b64")"
    "crlf-wrapped|$(printf '%s' "$b64" | fold -w64 | sed 's/$/\r/' | tr -d '\n')"
    "lf-wrapped|$(printf '%s' "$b64" | fold -w64)"
    "spaces-inside|$(printf '%s' "$b64" | fold -w61 | tr '\n' ' ')"
    "pem-armoured|$(printf -- '-----BEGIN CERTIFICATE-----\n%s\n-----END CERTIFICATE-----\n' "$(printf '%s' "$b64" | fold -w64)")"
    "literal-backslash-n|$(printf '%s' "$b64" | fold -w70 | sed 's/$/\\\\n/' | tr -d '\n')"
    "urlsafe|$(printf '%s' "$b64" | tr '+/' '-_')"
    "data-uri|data:application/x-pkcs12;base64,$(printf '%s' "$b64")"
    "missing-padding|$(printf '%s' "$b64" | sed 's/=*$//')"
    "hex-encoded|$(od -An -v -tx1 < "$orig" | tr -d ' \n')"
    "hex-uppercase|$(od -An -v -tx1 < "$orig" | tr -d ' \n' | tr 'a-f' 'A-F')"
    "quoted|\"$(printf '%s' "$b64")\""
  )
  for v in "${variants[@]}"; do
    local vname="${v%%|*}" vval="${v#*|}"
    n=$((n + 1))
    local out="$tmp/out.$n"
    rm -f "$out"
    rc=0
    VOR_B64_NOTES=""
    vor_decode_keystore_material "$vval" "$out" 2>/dev/null || rc=$?
    _check "decode:$vname" 0 "$rc" "$out"
  done

  # ── negative matrix: garbage must be rejected with a PRECISE reason ──
  local neg rc2
  for neg in "this is not base64!!!" "" "!!!"; do
    n=$((n + 1))
    local nout="$tmp/neg.$n"
    rm -f "$nout"
    rc2=0
    vor_decode_keystore_material "$neg" "$nout" 2>/dev/null || rc2=$?
    _check "reject:undecodable(${#neg} chars)" 1 "$rc2"
    [[ -n "$VOR_DECODE_REASON" ]] || { echo "FAIL  reject case left no precise reason"; failures=$((failures + 1)); }
  done

  # Valid base64 of a NON-keystore must decode but FAIL validation precisely.
  printf 'definitely not a keystore payload' > "$tmp/plain.txt"
  local pb64 pout rc3
  pb64="$(base64 -w0 "$tmp/plain.txt")"
  pout="$tmp/plain.out"
  rc3=0
  vor_materialize_keystore "$pb64" "$pout" "" "" || rc3=$?
  _check "reject:valid-b64-but-not-a-keystore" 1 "$rc3"
  [[ "$VOR_MATERIALIZATION_VERDICT" == *"NOT a keystore"* ]] \
    || { echo "FAIL  not-a-keystore reason not precise: $VOR_MATERIALIZATION_VERDICT"; failures=$((failures + 1)); }

  # Full materialization of the good JKS-magic payload must succeed.
  local gout rc4
  gout="$tmp/good.out"
  rc4=0
  vor_materialize_keystore "$b64" "$gout" "" "" || rc4=$?
  _check "materialize:valid-jks-magic" 0 "$rc4"

  # keytool present? Then prove password/alias/KEY diagnostics too (CI build jobs).
  if command -v keytool >/dev/null 2>&1; then
    local kt ks ktout rc5
    ks="$tmp/real.p12"
    kt=0
    keytool -genkeypair -keystore "$ks" -storetype PKCS12 -storepass storepass123 \
      -alias voralias -keyalg RSA -keysize 2048 -validity 30 \
      -dname "CN=Vor Selftest,O=Vor,C=US" >/dev/null 2>&1 || kt=$?
    if (( kt == 0 )); then
      local kb64
      kb64="$(base64 -w0 "$ks")"
      # wrong password → rc 1, precise reason
      ktout="$tmp/wrongpass.out"; rc5=0
      vor_materialize_keystore "$kb64" "$ktout" "wrongpass" "voralias" "storepass123" || rc5=$?
      _check "keytool:wrong-password-rejected" 1 "$rc5"
      [[ "$VOR_MATERIALIZATION_VERDICT" == *"password"* ]] \
        || { echo "FAIL  wrong-password reason not precise: $VOR_MATERIALIZATION_VERDICT"; failures=$((failures + 1)); }
      # right password, wrong alias, SINGLE-entry keystore → rc0 + alias auto-resolve
      ktout="$tmp/wrongalias.out"; rc5=0
      vor_materialize_keystore "$kb64" "$ktout" "storepass123" "nope" "storepass123" || rc5=$?
      _check "keytool:wrong-alias-single-auto-resolved" 0 "$rc5"
      [[ "$VOR_ALIAS_EFFECTIVE" == "voralias" ]] \
        || { echo "FAIL  single-alias auto-resolve: expected 'voralias', got '$VOR_ALIAS_EFFECTIVE'"; failures=$((failures + 1)); }
      # PKCS12 + wrong key-password secret: modern JDKs IGNORE -srckeypass for
      # PKCS12 stores ("Different store and key passwords not supported…"),
      # normalising to the store password — exactly what Gradle will do — so
      # rc stays 0 and NO override is needed.
      ktout="$tmp/p12-keypass-normalized.out"; rc5=0
      vor_materialize_keystore "$kb64" "$ktout" "storepass123" "voralias" "WRONGKEYPASS" || rc5=$?
      _check "keytool:pkcs12-keypass-normalized-by-jdk" 0 "$rc5"
      [[ -z "$VOR_KEY_PASSWORD_EFFECTIVE" ]] \
        || { echo "FAIL  pkcs12 normalized keypass must not set an override, got '$VOR_KEY_PASSWORD_EFFECTIVE'"; failures=$((failures + 1)); }
      # everything correct → rc 0, alias resolved, no key override
      ktout="$tmp/correct.out"; rc5=0
      vor_materialize_keystore "$kb64" "$ktout" "storepass123" "voralias" "storepass123" || rc5=$?
      _check "keytool:correct-material-ok" 0 "$rc5"
      [[ "$VOR_ALIAS_EFFECTIVE" == "voralias" && -z "$VOR_KEY_PASSWORD_EFFECTIVE" ]] \
        || { echo "FAIL  correct material overrides wrong (alias='$VOR_ALIAS_EFFECTIVE' key='$VOR_KEY_PASSWORD_EFFECTIVE')"; failures=$((failures + 1)); }
    else
      echo "note: keytool present but could not generate a test keystore (rc=$kt); skipping keytool proofs"
    fi

    # JKS scenarios: JKS is STRICT about key passwords (no JDK normalisation
    # like PKCS12) — this is where the real Gradle BadPadding lives.
    local jks jksb64
    jks="$tmp/distinct.jks"
    kt=0
    keytool -genkeypair -keystore "$jks" -storetype JKS -storepass sp123456 \
      -keypass kp456789 -alias distkey -keyalg RSA -keysize 2048 -validity 30 \
      -dname "CN=Vor Distinct,O=Vor,C=US" >/dev/null 2>&1 || kt=$?
    if (( kt == 0 )); then
      jksb64="$(base64 -w0 "$jks")"
      # correct distinct keypass → rc 0, no override
      ktout="$tmp/jks-ok.out"; rc5=0
      vor_materialize_keystore "$jksb64" "$ktout" "sp123456" "distkey" "kp456789" || rc5=$?
      _check "keytool:jks-distinct-keypass-ok" 0 "$rc5"
      # wrong keypass AND storepass doesn't unlock the key → rc 1, precise
      ktout="$tmp/jks-bad.out"; rc5=0
      vor_materialize_keystore "$jksb64" "$ktout" "sp123456" "distkey" "totally-wrong" || rc5=$?
      _check "keytool:jks-undecryptable-key-rejected" 1 "$rc5"
      [[ "$VOR_MATERIALIZATION_VERDICT" == *"cannot be decrypted"* ]] \
        || { echo "FAIL  undecryptable-key reason not precise: $VOR_MATERIALIZATION_VERDICT"; failures=$((failures + 1)); }
      # wrong alias + correct keypass → single-entry auto-resolve + key verified
      ktout="$tmp/jks-alias.out"; rc5=0
      vor_materialize_keystore "$jksb64" "$ktout" "sp123456" "vor" "kp456789" || rc5=$?
      _check "keytool:jks-wrong-alias-auto-resolved" 0 "$rc5"
      [[ "$VOR_ALIAS_EFFECTIVE" == "distkey" ]] \
        || { echo "FAIL  jks alias auto-resolve: expected 'distkey', got '$VOR_ALIAS_EFFECTIVE'"; failures=$((failures + 1)); }
    else
      echo "note: JKS distinct-keypass keystore could not be generated (rc=$kt); skipping"
    fi

    # JKS with keypass == storepass but a WRONG key-password secret → the
    # store-password fallback auto-corrects (same key, same identity).
    jks="$tmp/samepass.jks"
    kt=0
    keytool -genkeypair -keystore "$jks" -storetype JKS -storepass sp123456 \
      -keypass sp123456 -alias samekey -keyalg RSA -keysize 2048 -validity 30 \
      -dname "CN=Vor Same,O=Vor,C=US" >/dev/null 2>&1 || kt=$?
    if (( kt == 0 )); then
      jksb64="$(base64 -w0 "$jks")"
      ktout="$tmp/jks-autocorrect.out"; rc5=0
      vor_materialize_keystore "$jksb64" "$ktout" "sp123456" "samekey" "wrongpass1" || rc5=$?
      _check "keytool:jks-key-password-auto-corrected" 0 "$rc5"
      [[ "$VOR_KEY_PASSWORD_EFFECTIVE" == "sp123456" ]] \
        || { echo "FAIL  jks key-password auto-correct: expected sp123456, got '$VOR_KEY_PASSWORD_EFFECTIVE'"; failures=$((failures + 1)); }
    else
      echo "note: JKS same-pass keystore could not be generated (rc=$kt); skipping"
    fi

    # Certificate-only keystore: alias resolves but is NOT a signing key.
    local ks3 cer b3
    cer="$tmp/c.cer"; ks3="$tmp/certonly.p12"
    kt=0
    keytool -exportcert -keystore "$ks" -storepass storepass123 -alias voralias \
      -file "$cer" >/dev/null 2>&1 \
      && keytool -importcert -keystore "$ks3" -storetype PKCS12 -storepass certpass \
           -alias certalias -file "$cer" -noprompt >/dev/null 2>&1 || kt=$?
    if (( kt == 0 )); then
      b3="$(base64 -w0 "$ks3")"
      ktout="$tmp/certonly.out"; rc5=0
      vor_materialize_keystore "$b3" "$ktout" "certpass" "certalias" "certpass" || rc5=$?
      _check "keytool:certificate-only-rejected" 1 "$rc5"
      [[ "${VOR_MATERIALIZATION_VERDICT,,}" == *"trustedcertentry"* ]] \
        || { echo "FAIL  certificate-only reason not precise: $VOR_MATERIALIZATION_VERDICT"; failures=$((failures + 1)); }
    else
      echo "note: certificate-only keystore could not be generated (rc=$kt); skipping"
    fi

    # Multi-alias keystore + wrong alias → rc 3 listing EVERY alias (never guess).
    local ks4 b4
    ks4="$tmp/multi.p12"
    kt=0
    keytool -importkeystore -noprompt -srckeystore "$ks" -srcstorepass storepass123 \
      -destkeystore "$ks4" -deststoretype PKCS12 -deststorepass multipass \
      -destkeypass multipass >/dev/null 2>&1 \
      && keytool -genkeypair -keystore "$ks4" -storetype PKCS12 -storepass multipass \
           -alias secondkey -keyalg RSA -keysize 2048 -validity 30 \
           -dname "CN=Vor Second,O=Vor,C=US" >/dev/null 2>&1 || kt=$?
    if (( kt == 0 )); then
      b4="$(base64 -w0 "$ks4")"
      ktout="$tmp/multi.out"; rc5=0
      vor_materialize_keystore "$b4" "$ktout" "multipass" "doesnotexist" "multipass" || rc5=$?
      _check "keytool:multi-alias-unresolvable" 3 "$rc5"
      grep -q "voralias" <<<"$VOR_MATERIALIZATION_VERDICT" && grep -q "secondkey" <<<"$VOR_MATERIALIZATION_VERDICT" \
        || { echo "FAIL  multi-alias reason must list both aliases: $VOR_MATERIALIZATION_VERDICT"; failures=$((failures + 1)); }
    else
      echo "note: multi-alias keystore could not be generated (rc=$kt); skipping"
    fi
  else
    echo "note: keytool absent — magic-byte proofs only (CI build jobs get the keytool proofs)"
  fi

  echo "vor_keystore_selftest: PASS=$pass FAIL=$failures"
  (( failures == 0 )) || return 1
  return 0
}

# Execute directly → run the proof suite.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [[ "${1:-}" == "--self-test" ]]; then
    vor_keystore_selftest
    exit $?
  fi
  cat >&2 <<'USAGE'
usage: materialize-keystore.sh --self-test
       (or source this file and call vor_materialize_keystore …)
USAGE
  exit 2
fi
