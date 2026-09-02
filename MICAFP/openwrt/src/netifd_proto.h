#ifndef UNIFIEDSHIELD_NETIFD_PROTO_H
#define UNIFIEDSHIELD_NETIFD_PROTO_H

#ifdef __cplusplus
extern "C" {
#endif

int netifd_proto_init(const char* dev_name);
int netifd_proto_setup(const char* ip_address,
                       int prefix_len,
                       const char* gateway,
                       int mtu,
                       const char** dns_servers,
                       int dns_count);
void netifd_proto_process(void);
void netifd_proto_cleanup(void);
void netifd_proto_notify(const char* event);
int netifd_proto_add_excluded_route(const char* cidr);

#ifdef __cplusplus
}
#endif

#endif /* UNIFIEDSHIELD_NETIFD_PROTO_H */
