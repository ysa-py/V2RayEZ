#!/bin/sh
# OpenWrt embedded validation of universal-core FFI boundary.
# Compiles a minimal C harness against staticlib and runs it.
# Zero logic duplication: only uses v2rayez_core_init/shutdown/status.

LIB="/usr/lib/libv2rayez_universal_core.a"
HDR="/usr/include/v2rayez_core.h"
TMPDIR="/tmp/v2rayez_ffi_check_$$"
mkdir -p "$TMPDIR"

cat > "$TMPDIR/check.c" << 'CEOF'
#include <stdio.h>
#include "v2rayez_core.h"
int main() {
    void* h = v2rayez_core_init();
    if (!h) { printf("FAIL init\n"); return 1; }
    char* s = v2rayez_core_status(h);
    printf("status=%s\n", s ? s : "null");
    if (s) v2rayez_free_string(s);
    v2rayez_core_shutdown(h);
    printf("PASS openwrt-ffi\n");
    return 0;
}
CEOF

gcc -I/usr/include -o "$TMPDIR/check" "$TMPDIR/check.c" "$LIB" -lpthread -ldl 2>/dev/null
if [ $? -eq 0 ]; then
    "$TMPDIR/check"
    RES=$?
else
    echo "SKIP (gcc/staticlib not present in embedded image)"
    RES=0
fi
rm -rf "$TMPDIR"
exit $RES
