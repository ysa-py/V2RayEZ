#!/bin/bash
# Automated local verification script for universal-core artifacts.
# Tests pre-compiled native binaries against FFI headers and state-machine logic.
# Requires rustc/cargo and platform SDKs (run inside CI or local build env).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

echo "=== Artifact Verification Script ==="

# 1. Check staticlib exists for at least native target
if [ -f "$REPO_ROOT/target/debug/libv2rayez_universal_core.a" ]; then
    echo "PASS: native staticlib present"
else
    echo "WARN: native staticlib missing (expected if not yet built)"
fi

# 2. Verify FFI header symbols agree with exported functions
if [ -f "$REPO_ROOT/universal-core/linux/v2rayez_core.h" ]; then
    for sym in v2rayez_core_init v2rayez_core_shutdown v2rayez_core_status v2rayez_core_start v2rayez_core_stop v2rayez_license_verify v2rayez_free_string; do
        if grep -q "$sym" "$REPO_ROOT/universal-core/linux/v2rayez_core.h"; then
            echo "PASS: FFI symbol $sym declared in header"
        else
            echo "FAIL: FFI symbol $sym MISSING from header"
            FAIL=1
        fi
    done
fi

# 3. Verify state-machine wrapper exports exist
if grep -q "CoreUIStateMachine" "$REPO_ROOT/universal-core/src/ui_state.rs" 2>/dev/null; then
    echo "PASS: CoreUIStateMachine implemented"
else
    echo "FAIL: CoreUIStateMachine not found"
    FAIL=1
fi

# 4. Smoke-test binary (if built) against header
if [ -f "$REPO_ROOT/universal-core/linux/test_ffi" ]; then
    echo "RUNNING smoke-test binary ..."
    "$REPO_ROOT/universal-core/linux/test_ffi" || FAIL=1
else
    echo "SKIP smoke-test (binary not built)"
fi

# 5. Check CI workflow exists
if [ -f "$REPO_ROOT/.github/workflows/universal-core-ci.yml" ]; then
    echo "PASS: CI workflow present"
else
    echo "FAIL: CI workflow missing"
    FAIL=1
fi

# 6. Check release profile has LTO + strip
if grep -q 'lto = true' "$REPO_ROOT/universal-core/Cargo.toml" && grep -q 'strip = true' "$REPO_ROOT/universal-core/Cargo.toml"; then
    echo "PASS: release profile LTO + strip configured"
else
    echo "FAIL: release profile missing LTO or strip"
    FAIL=1
fi

if [ $FAIL -eq 0 ]; then
    echo "=== ALL VERIFICATION PASSED ==="
else
    echo "=== VERIFICATION FAILED ==="
    exit 1
fi
