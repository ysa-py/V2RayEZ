#include <stdio.h>
#include <string.h>
#include "v2rayez_core.h"
int main(void) {
    void* h = v2rayez_core_init();
    if (!h) { printf("FAIL init\n"); return 1; }
    char* st = v2rayez_core_status(h);
    printf("status=%s\n", st ? st : "null");
    if (st) v2rayez_free_string(st);
    char* resp = v2rayez_core_start(h, "{\"command\":\"Start\"}");
    printf("start=%s\n", resp ? resp : "null");
    if (resp) v2rayez_free_string(resp);
    char* stp = v2rayez_core_stop(h);
    printf("stop=%s\n", stp ? stp : "null");
    if (stp) v2rayez_free_string(stp);
    v2rayez_core_shutdown(h);
    printf("PASS linux-ffi\n");
    return 0;
}
