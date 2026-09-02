#ifndef UNIFIEDSHIELD_UCI_CONFIG_H
#define UNIFIEDSHIELD_UCI_CONFIG_H

#ifdef __cplusplus
extern "C" {
#endif

#define MAX_EXCLUDED_IPS 256
#define UNIFIEDSHIELD_STR_SMALL 64
#define UNIFIEDSHIELD_STR_MEDIUM 256

struct unifiedshield_config {
    int enabled;
    char core[UNIFIEDSHIELD_STR_SMALL];
    char server[UNIFIEDSHIELD_STR_MEDIUM];
    int server_port;
    char password[UNIFIEDSHIELD_STR_MEDIUM];
    char dns_server[UNIFIEDSHIELD_STR_SMALL];
    char dns_server_backup[UNIFIEDSHIELD_STR_SMALL];
    char tun_name[UNIFIEDSHIELD_STR_SMALL];
    int kill_switch;
    int split_tunnel;
    int auto_core_switch;
    int mtu;
    double dpi_threshold;
    char excluded_ips[MAX_EXCLUDED_IPS][UNIFIEDSHIELD_STR_SMALL];
    int excluded_ip_count;
};

int uci_load_config(const char* config_name,
                    const char* section_name,
                    struct unifiedshield_config* config);
int uci_reload_config(void);
void uci_free_config(struct unifiedshield_config* config);
int uci_set_option(const char* config_name,
                   const char* section_name,
                   const char* option,
                   const char* value);

#ifdef __cplusplus
}
#endif

#endif /* UNIFIEDSHIELD_UCI_CONFIG_H */
