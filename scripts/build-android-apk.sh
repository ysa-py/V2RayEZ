#!/usr/bin/env bash
# build-android-apk.sh
#
# Backwards-compatible wrapper around the canonical automated APK pipeline.
# All build, structural validation, alignment (zipalign -p 4) and
# multi-scheme signing (APK Signature v1+v2+v3+v4) is performed by
# scripts/build-apk-fix.sh. This wrapper intentionally delegates to it so the
# release always emits a single valid, verified universal APK.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$ROOT/scripts/build-apk-fix.sh" "$@"
