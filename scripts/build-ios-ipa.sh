#!/usr/bin/env bash
# Build the iOS deliverable via the Xcode command line (fail-closed, no
# fabricated artifacts).
#
# Behaviour
#   1. resolves the xcodegen project directory + generated .xcodeproj by reading
#      `project.yml` (never hard-codes `V2RayEZ.xcodeproj`);
#   2. stages the cross-compiled Rust staticlib for the app/tunnel targets;
#   3. produces a real Release archive (unsigned / `CODE_SIGNING_ALLOWED=NO`
#      unless signing material is present);
#   4. exports a real `.ipa` when the runner can code-sign, otherwise ships the
#      real `.xcarchive` as a zip (Xcode cannot export an unsigned .ipa);
#   5. verifies every artifact: an `.ipa` must contain a Mach-O executable.
#
# It never synthesises an app bundle, an executable, or an `.ipa`.
set -euo pipefail

ROOT="${IOS_ROOT_OVERRIDE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
# shellcheck source=./ios-packaging.sh
source "$ROOT/scripts/ios-packaging.sh"

IOS_ROOT_OVERRIDE="$ROOT"
DIST="${IOS_DIST_DIR:-$ROOT/dist-ios}"
FINAL="$DIST/final"
mkdir -p "$FINAL"

VERSION="${VERSION:-${IOS_VERSION:-2.0.0}}"

ios_log "building iOS deliverable (root=$ROOT)"

PROJECT_DIR="$(ios_resolve_project_dir "$ROOT")" ||
  ios_die "no xcodegen project.yml found under $ROOT (expected MICAFP/ios/project.yml)"
ios_log "project dir: $PROJECT_DIR"

if command -v xcodegen >/dev/null 2>&1; then
  (cd "$PROJECT_DIR" && xcodegen generate 2>&1 | tail -n 20) ||
    ios_die "xcodegen generate failed in $PROJECT_DIR"
elif [[ ! -d "$(ios_resolve_xcodeproj "$PROJECT_DIR")" ]]; then
  # Previously this silently fell through to a synthesized .ipa. The generated
  # Xcode project is never committed, so without xcodegen there is nothing to
  # build — say so instead of producing something fake.
  ios_die "xcodegen is not installed and $PROJECT_DIR contains no generated Xcode project; install it with 'brew install xcodegen'"
fi

XCODEPROJ="$(ios_resolve_xcodeproj "$PROJECT_DIR")"
SCHEME="${IOS_SCHEME:-$(ios_project_scheme "$PROJECT_DIR" || true)}"
[[ -n "$SCHEME" ]] || SCHEME="V2RayEZ"
ios_log "project: $XCODEPROJ  scheme: $SCHEME"

[[ -d "$XCODEPROJ" ]] || ios_die "Xcode project not found: $XCODEPROJ (run xcodegen generate)"

ios_place_core_lib "$PROJECT_DIR" "$ROOT"

ARCHIVE="$DIST/Vor.xcarchive"
rm -rf "$ARCHIVE"

# Build the archive. Arguments are passed as a real argv array — the previous
# `xcodebuild "$OPTS" archive` passed the whole option string as a single
# argument, which xcodebuild can never parse.
ARGS=(
  -project "$XCODEPROJ"
  -scheme "$SCHEME"
  -configuration Release
  -archivePath "$ARCHIVE"
  archive
)

if ios_signing_available; then
  ios_log "signing material detected: producing a signed archive"
  if [[ -n "${APPLE_TEAM_ID:-}" ]]; then
    ARGS+=(DEVELOPMENT_TEAM="$APPLE_TEAM_ID")
  fi
  if [[ -n "${APPLE_PROVISIONING_PROFILE:-}" ]]; then
    ARGS+=(PROVISIONING_PROFILE_SPECIFIER="$APPLE_PROVISIONING_PROFILE")
  fi
  ARGS+=(-allowProvisioningUpdates)
else
  ios_log "no signing identity on this runner: producing an unsigned archive"
  ARGS+=(
    CODE_SIGNING_ALLOWED=NO
    CODE_SIGNING_REQUIRED=NO
    CODE_SIGN_IDENTITY=""
    AD_HOC_CODE_SIGNING_ALLOWED=YES
  )
fi

ARCHIVE_LOG="$DIST/xcodebuild-archive.log"
if ! (cd "$PROJECT_DIR" && ios_run_logged "$ARCHIVE_LOG" "xcodebuild archive failed" xcodebuild "${ARGS[@]}"); then
  ios_die "xcodebuild archive failed (full log: $ARCHIVE_LOG)"
fi

if [[ ! -d "$ARCHIVE" ]]; then
  ios_annotate error "xcodebuild produced no .xcarchive" "$(tail -n 40 "$ARCHIVE_LOG" 2>/dev/null || true)"
  ios_die "xcodebuild did not produce $ARCHIVE"
fi

EXPORT_PLIST="$(ios_ensure_export_options "$PROJECT_DIR" "$ROOT")"

if ios_signing_available; then
  ios_log "exporting signed ipa with $EXPORT_PLIST"
  rm -rf "$DIST/export"
  EXPORT_LOG="$DIST/xcodebuild-export.log"
  (cd "$PROJECT_DIR" && ios_run_logged "$EXPORT_LOG" "xcodebuild -exportArchive failed" \
    xcodebuild -exportArchive \
      -archivePath "$ARCHIVE" \
      -exportOptionsPlist "$EXPORT_PLIST" \
      -exportPath "$DIST/export" \
      -allowProvisioningUpdates) ||
    ios_die "xcodebuild -exportArchive failed (full log: $EXPORT_LOG)"

  IPA="$(find "$DIST/export" -name '*.ipa' -type f -print -quit 2>/dev/null || true)"
  [[ -n "$IPA" ]] || ios_die "no .ipa produced by -exportArchive"
  cp -v "$IPA" "$FINAL/Vor.ipa"
  cp -v "$IPA" "$FINAL/Vor-v${VERSION}-ios.ipa"
  ios_verify_ipa "$FINAL/Vor.ipa"
  ios_log "signed ipa ready: $FINAL/Vor.ipa"
else
  # Xcode cannot export an unsigned .ipa, so ship the real archive instead.
  ios_log "no signing identity: packaging the real unsigned artifacts"
  # Xcode cannot export an .ipa without a signing identity, but sideloading
  # tools (AltStore / SideStore / Sideloadly) sign the IPA with the user's own
  # Apple ID, so they need an unsigned IPA built from the real compiled .app.
  ios_package_unsigned_ipa "$ARCHIVE" "$FINAL/Vor-v${VERSION}-ios-unsigned.ipa"
  ios_zip_archive "$ARCHIVE" "$FINAL/Vor-v${VERSION}-ios-unsigned.xcarchive.zip"
  {
    echo "signing_status: unsigned (sideload-ready)"
    echo "reason: no signing identity on this runner"
    echo "artifact_unsigned_ipa: Vor-v${VERSION}-ios-unsigned.ipa"
    echo "artifact_unsigned_archive: Vor-v${VERSION}-ios-unsigned.xcarchive.zip"
    echo "note: install with AltStore / SideStore / Sideloadly, which re-sign the"
    echo "      IPA with your own free Apple ID. Not installable as-is: iOS"
    echo "      requires a signature before it will launch an app."
  } > "$FINAL/Vor-v${VERSION}-ios-SIGNING-STATUS.txt"
  ios_log "unsigned artifacts ready: unsigned ipa + xcarchive + status report"
fi

ls -lh "$FINAL/"
