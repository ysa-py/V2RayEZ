#ifndef V2RAYEZ_CORE_H
#define V2RAYEZ_CORE_H
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Memory ownership: all char* returned must be freed with v2rayez_free_string */
void* v2rayez_core_init(void);
void v2rayez_core_shutdown(void* handle);
char* v2rayez_core_status(void* handle);
char* v2rayez_core_start(void* handle, const char* request_json);
char* v2rayez_core_stop(void* handle);
char* v2rayez_license_verify(const char* keys_json, const char* token);
void v2rayez_free_string(char* s);
#ifdef __cplusplus
}
#endif
#endif
