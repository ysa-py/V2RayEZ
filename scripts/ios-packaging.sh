#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Shared iOS packaging helpers (fail-closed, zero fabrication).
#
# Why this file exists
#   `scripts/build-ios-ipa.sh` and `universal-core/apple/build-ipa.sh` used to
#   contain two real defects:
#     1. they hard-coded `-project V2RayEZ.xcodeproj`, but `xcodegen` generates
#        `<name>.xcodeproj` and `MICAFP/ios/project.yml` declares `name: Vor`,
#        so the archive command could never resolve the project;
#     2. when the archive/export failed they synthesised an `.ipa` whose
#        `CFBundleExecutable` was a one-line `/bin/sh` script — a file that
#        looks like a shippable app and is not one.
#
#   Both entry points now source this helper, so the behaviour is identical in
#   every pipeline and the "fallback" can never fabricate a binary again.
#
# Design rules (kept additive — no capability is removed):
#   * unsigned/ad-hoc archives are still produced (that is a real build output);
#   * a real, signed/exportable `.ipa` is produced whenever signing material is
#     actually available on the runner;
#   * when Xcode cannot produce an `.ipa` (no signing identity), the real
#     `.xcarchive` is zipped and shipped instead — still a genuine artifact;
#   * every produced artifact is verified: an `.ipa` must contain a Mach-O
#     executable, otherwise the build fails loudly.
#
# Sourcing contract:
#   source scripts/ios-packaging.sh
#   ROOT must be the repository root (defaults to the parent of this file).
# ---------------------------------------------------------------------------
# shellcheck shell=bash

IOS_PACKAGING_VERSION=1

ios_root() {
  # Allow an explicit override; otherwise derive from this file's location.
  if [[ -n "${IOS_ROOT_OVERRIDE:-}" ]]; then
    printf '%s' "$IOS_ROOT_OVERRIDE"
    return 0
  fi
  (cd "$(dirname "${BASH_SOURCE[1]:-$BASH_SOURCE[0]}")/.." && pwd)
}

ios_die() {
  echo "error: $*" >&2
  exit 1
}

ios_log() {
  echo "[ios-packaging] $*"
}

ios_warn() {
  echo "[ios-packaging] warning: $*" >&2
}

# Emit the real failure text as ONE GitHub annotation. Runner logs are not
# always retrievable (restricted runners, expired artifacts), and a plain
# stderr line is easy to miss inside thousands of build lines.
ios_annotate() {
  local level="$1"
  local title="$2"
  local body="${3:-}"
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    body="${body//%/%25}"
    body="${body//$'\r'/}"
    body="${body//$'\n'/%0A}"
    echo "::${level}::${title//%/%25}%0A${body:0:60000}"
  fi
  echo "[ios-packaging] ${level}: ${title}" >&2
  [[ -n "$3" ]] && echo "$3" >&2
  return 0
}

# Run a command, tee its output to a log, and on failure publish the tail as an
# annotation before dying.
ios_run_logged() {
  local log="$1"
  local title="$2"
  shift 2
  : > "$log"
  if ! "$@" 2>&1 | tee "$log"; then
    local tail_text
    tail_text="$(tail -n 80 "$log" 2>/dev/null || true)"
    ios_annotate error "$title" "$tail_text"
    return 1
  fi
  return 0
}

# Resolve the directory that holds `project.yml` (the xcodegen input).
ios_resolve_project_dir() {
  local root="$1"
  if [[ -f "$root/MICAFP/ios/project.yml" ]]; then
    printf '%s' "$root/MICAFP/ios"
    return 0
  fi
  if [[ -f "$root/project.yml" ]]; then
    printf '%s' "$root"
    return 0
  fi
  return 1
}

# Read the xcodegen project name straight out of project.yml. xcodegen always
# writes `<name>.xcodeproj`, so this is the only reliable source of truth.
ios_project_name() {
  local dir="$1"
  [[ -f "$dir/project.yml" ]] || return 1
  sed -n 's/^name:[[:space:]]*"\{0,1\}\([^"[:space:]]\{1,\}\)"\{0,1\}[[:space:]]*$/\1/p' \
    "$dir/project.yml" | head -n1
}

# First target under `targets:` in project.yml (xcodegen emits one scheme per
# application/extension target; the first application target is the app scheme).
ios_project_scheme() {
  local dir="$1"
  [[ -f "$dir/project.yml" ]] || return 1
  awk '
    /^targets:[[:space:]]*$/ { intargets=1; next }
    intargets && /^[^[:space:]#]/ { intargets=0 }
    intargets && /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ {
      name=$1; sub(/:$/, "", name); print name; exit
    }
  ' "$dir/project.yml"
}

# Resolve the generated .xcodeproj path. After `xcodegen generate` the project
# exists on disk; before it, we fall back to `<name>.xcodeproj` so callers can
# run xcodegen with a deterministic expected path.
ios_resolve_xcodeproj() {
  local dir="$1"
  local name
  name="$(ios_project_name "$dir" || true)"
  [[ -z "$name" ]] && name="${IOS_PROJECT_NAME:-Vor}"

  if [[ -d "$dir/$name.xcodeproj" ]]; then
    printf '%s' "$dir/$name.xcodeproj"
    return 0
  fi
  local found
  found="$(find "$dir" -maxdepth 1 -name '*.xcodeproj' -print -quit 2>/dev/null || true)"
  if [[ -n "$found" ]]; then
    printf '%s' "$found"
    return 0
  fi
  # Not generated yet — return the deterministic expected path.
  printf '%s' "$dir/$name.xcodeproj"
  return 0
}

ios_require_tools() {
  command -v xcodebuild >/dev/null 2>&1 || ios_die "xcodebuild not available on this host"
  command -v xcodegen >/dev/null 2>&1 || ios_warn "xcodegen missing; assuming the Xcode project is already generated"
}

# Copy the cross-compiled Rust staticlib next to the Xcode project. The app
# target's pre-build script warns (and the tunnel target fails to link) when
# `libv2rayez_universal.a` is absent.
ios_place_core_lib() {
  local dir="$1"
  local root="$2"
  local candidates=(
    "$root/dist-ios/libs/libv2rayez_universal_core.a"
    "$root/dist-ios/ios-arm64/libv2rayez_universal_core.a"
    "$root/universal-core/target/aarch64-apple-ios/release/libv2rayez_universal_core.a"
  )
  local found
  found="$(find "$root/universal-core/target" -path '*aarch64-apple-ios/release/libv2rayez_universal_core.a' -print -quit 2>/dev/null || true)"

  local lib=""
  for candidate in "${candidates[@]}"; do
    [[ -s "$candidate" ]] && { lib="$candidate"; break; }
  done
  [[ -z "$lib" && -s "$found" ]] && lib="$found"

  if [[ -n "$lib" ]]; then
    cp -v "$lib" "$dir/libv2rayez_universal.a"
    ios_log "core staticlib staged: $lib"
  else
    ios_warn "no aarch64-apple-ios staticlib found; the archive may fail to link the shared core"
  fi
}

# True when the runner can actually code-sign (used to decide whether a real
# `.ipa` export is possible at all — an unsigned .ipa is not producible).
ios_signing_available() {
  [[ "${IOS_SIGNING_AVAILABLE:-}" == "1" ]] && return 0
  if [[ -n "${APPLE_TEAM_ID:-}" && -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
    return 0
  fi
  if command -v security >/dev/null 2>&1; then
    if security find-identity -v -p codesigning 2>/dev/null | grep -q '1)'; then
      return 0
    fi
  fi
  return 1
}

ios_ensure_export_options() {
  local dir="$1"
  local root="$2"
  if [[ -f "$dir/ExportOptions.plist" ]]; then
    printf '%s' "$dir/ExportOptions.plist"
    return 0
  fi
  local template="$root/universal-core/apple/ExportOptions.plist"
  if [[ -f "$template" ]]; then
    cp -v "$template" "$dir/ExportOptions.plist"
    printf '%s' "$dir/ExportOptions.plist"
    return 0
  fi
  cat > "$dir/ExportOptions.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>ad-hoc</string>
  <key>signingStyle</key><string>automatic</string>
  <key>stripSwiftSymbols</key><true/>
  <key>compileBitcode</key><false/>
</dict>
</plist>
PLIST
  printf '%s' "$dir/ExportOptions.plist"
}

# Accept only real Mach-O executables (or fat/universal binaries). Everything
# else — shell scripts, empty files, text — is rejected.
ios_is_macho() {
  local f="$1"
  [[ -f "$f" && -s "$f" ]] || return 1
  if command -v file >/dev/null 2>&1; then
    if file "$f" 2>/dev/null | grep -qiE 'mach-o|universal binary'; then
      return 0
    fi
  fi
  local magic
  magic="$(od -An -tx1 -N4 "$f" 2>/dev/null | tr -d ' \n' | tr 'a-f' 'A-F')"
  case "$magic" in
    FEEDFACE|FEEDFACF|CEFAEDFE|CFFAEDFE|CAFEBABE|BEBAFECA|CAFEBABF) return 0 ;;
    *) return 1 ;;
  esac
}

# Verify an unpacked .app bundle: Info.plist + Mach-O CFBundleExecutable.
ios_verify_app_bundle() {
  local app="$1"
  [[ -d "$app" ]] || ios_die "app bundle missing: $app"
  [[ -f "$app/Info.plist" ]] || ios_die "app bundle has no Info.plist: $app"

  local exe=""
  if command -v defaults >/dev/null 2>&1; then
    exe="$(defaults read "$app/Info.plist" CFBundleExecutable 2>/dev/null || true)"
  fi
  if [[ -z "$exe" ]]; then
    # Works for both single-line and pretty-printed plists (newlines removed).
    local flat
    flat="$(tr -d '\n' < "$app/Info.plist" 2>/dev/null || true)"
    exe="$(printf '%s' "$flat" |
      sed -n 's/.*<key>CFBundleExecutable<\/key>[[:space:]]*<string>\([^<]*\)<\/string>.*/\1/p' |
      head -n1)"
  fi
  [[ -n "$exe" ]] || ios_die "cannot read CFBundleExecutable from $app/Info.plist"
  ios_is_macho "$app/$exe" ||
    ios_die "CFBundleExecutable '$exe' in $app is not a Mach-O binary (refusing to ship a non-executable app bundle)"

  ios_log "verified app bundle: $app (executable $exe is Mach-O)"
}

# Verify a packaged .ipa: unzip into a scratch dir and validate the payload.
ios_verify_ipa() {
  local ipa="$1"
  [[ -s "$ipa" ]] || ios_die "ipa missing or empty: $ipa"
  command -v unzip >/dev/null 2>&1 || ios_die "unzip required to verify $ipa"

  local tmp
  tmp="$(mktemp -d)"
  unzip -q "$ipa" -d "$tmp" 2>/dev/null || ios_die "cannot unzip $ipa (not a valid ipa archive)"

  local app
  app="$(find "$tmp/Payload" -maxdepth 1 -name '*.app' -print -quit 2>/dev/null || true)"
  [[ -n "$app" ]] || { rm -rf "$tmp"; ios_die "no Payload/*.app inside $ipa"; }

  if ! ios_verify_app_bundle "$app"; then
    rm -rf "$tmp"
    exit 1
  fi
  rm -rf "$tmp"
  ios_log "verified ipa: $ipa"
}

# Package a real, unsigned .xcarchive as a zip. This is a genuine Xcode build
# output (compiled app + dSYMs) — used when no signing identity exists, because
# Xcode cannot export an .ipa without one.
ios_zip_archive() {
  local archive="$1"
  local out="$2"
  [[ -d "$archive" ]] || ios_die "xcarchive missing: $archive"
  local app
  app="$(find "$archive/Products/Applications" -maxdepth 1 -name '*.app' -print -quit 2>/dev/null || true)"
  [[ -n "$app" ]] || ios_die "xcarchive contains no Products/Applications/*.app: $archive"
  ios_verify_app_bundle "$app"

  mkdir -p "$(dirname "$out")"
  local abs_out
  abs_out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
  rm -f "$abs_out"
  (
    cd "$(dirname "$archive")" &&
      zip -q -r "$abs_out" "$(basename "$archive")"
  ) || ios_die "cannot zip $archive"
  [[ -s "$abs_out" ]] || ios_die "archive zip not produced: $abs_out"
  ios_log "packaged unsigned xcarchive: $abs_out"
}
