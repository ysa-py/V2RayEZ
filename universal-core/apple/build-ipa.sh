#!/usr/bin/env bash
# Build the iOS deliverable from the `universal-core` tree (fail-closed, no
# fabricated artifacts).
#
# This entry point is preserved for callers that drive the build from
# `universal-core/apple/`. It shares the exact same implementation as
# `scripts/build-ios-ipa.sh` by sourcing `scripts/ios-packaging.sh`, so both
# paths behave identically:
#   * resolve the xcodegen project + scheme from `project.yml`;
#   * archive for real (unsigned when no signing identity exists);
#   * export a real `.ipa` only when a signing identity is available;
#   * otherwise ship the real `.xcarchive` as a zip;
#   * verify every artifact contains a Mach-O executable.
#
# The previous "minimal IPA fallback" (a shell script named as the app
# executable) is gone: a non-executable .ipa is never emitted.
set -euo pipefail

ROOT="${IOS_ROOT_OVERRIDE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
if [[ -f "$ROOT/scripts/build-ios-ipa.sh" ]]; then
  exec bash "$ROOT/scripts/build-ios-ipa.sh"
fi

# shellcheck source=../../scripts/ios-packaging.sh
source "$ROOT/scripts/ios-packaging.sh"
IOS_ROOT_OVERRIDE="$ROOT"

DIST="${IOS_DIST_DIR:-$ROOT/dist-ios}"
FINAL="$DIST/final"
mkdir -p "$FINAL"
VERSION="${VERSION:-${IOS_VERSION:-2.0.0}}"

ios_log "building iOS deliverable from universal-core (root=$ROOT)"

PROJECT_DIR="$(ios_resolve_project_dir "$ROOT")" ||
  ios_die "no xcodegen project.yml found under $ROOT"
if command -v xcodegen >/dev/null 2>&1; then
  (cd "$PROJECT_DIR" && xcodegen generate 2>&1 | tail -n 20) ||
    ios_die "xcodegen generate failed in $PROJECT_DIR"
fi

XCODEPROJ="$(ios_resolve_xcodeproj "$PROJECT_DIR")"
SCHEME="${IOS_SCHEME:-$(ios_project_scheme "$PROJECT_DIR" || true)}"
[[ -n "$SCHEME" ]] || SCHEME="V2RayEZ"
[[ -d "$XCODEPROJ" ]] || ios_die "Xcode project not found: $XCODEPROJ"

ios_place_core_lib "$PROJECT_DIR" "$ROOT"

ARCHIVE="$DIST/Vor.xcarchive"
rm -rf "$ARCHIVE"
ARGS=(-project "$XCODEPROJ" -scheme "$SCHEME" -configuration Release -archivePath "$ARCHIVE" archive)
if ios_signing_available; then
  ARGS+=(-allowProvisioningUpdates)
  [[ -n "${APPLE_TEAM_ID:-}" ]] && ARGS+=(DEVELOPMENT_TEAM="$APPLE_TEAM_ID")
else
  ARGS+=(
    CODE_SIGNING_ALLOWED=NO
    CODE_SIGNING_REQUIRED=NO
    CODE_SIGN_IDENTITY=""
    AD_HOC_CODE_SIGNING_ALLOWED=YES
  )
fi
(cd "$PROJECT_DIR" && xcodebuild "${ARGS[@]}" 2>&1 | tail -n 120) ||
  ios_die "xcodebuild archive failed"
[[ -d "$ARCHIVE" ]] || ios_die "xcodebuild did not produce $ARCHIVE"

if ios_signing_available; then
  EXPORT_PLIST="$(ios_ensure_export_options "$PROJECT_DIR" "$ROOT")"
  rm -rf "$DIST/export"
  (cd "$PROJECT_DIR" && xcodebuild -exportArchive -archivePath "$ARCHIVE" \
    -exportOptionsPlist "$EXPORT_PLIST" -exportPath "$DIST/export" \
    -allowProvisioningUpdates 2>&1 | tail -n 60) ||
    ios_die "xcodebuild -exportArchive failed"
  IPA="$(find "$DIST/export" -name '*.ipa' -type f -print -quit 2>/dev/null || true)"
  [[ -n "$IPA" ]] || ios_die "no .ipa produced by -exportArchive"
  cp -v "$IPA" "$FINAL/Vor.ipa"
  cp -v "$IPA" "$FINAL/Vor-v${VERSION}-ios.ipa"
  ios_verify_ipa "$FINAL/Vor.ipa"
else
  ios_zip_archive "$ARCHIVE" "$FINAL/Vor-v${VERSION}-ios-unsigned.xcarchive.zip"
fi

ls -lh "$FINAL/"
