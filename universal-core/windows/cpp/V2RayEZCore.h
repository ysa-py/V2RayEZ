#pragma once
#include <string>
#include <utility>
#include "v2rayez_core.h"

namespace V2RayEZ {

/// RAII C++ wrapper over universal-core FFI.
/// Memory ownership: returned char* are converted to std::string and
/// immediately freed via v2rayez_free_string; handle dropped on destructor.
class CoreBinding {
    void* handle_ = nullptr;
public:
    CoreBinding() { handle_ = v2rayez_core_init(); }
    ~CoreBinding() {
        if (handle_) {
            v2rayez_core_shutdown(handle_);
            handle_ = nullptr;
        }
    }
    CoreBinding(const CoreBinding&) = delete;
    CoreBinding& operator=(const CoreBinding&) = delete;

    std::string status() {
        if (!handle_) return "{}";
        char* c = v2rayez_core_status(handle_);
        std::string s(c ? c : "{}");
        if (c) v2rayez_free_string(c);
        return s;
    }

    std::string start(const std::string& req) {
        if (!handle_) return "{}";
        char* c = v2rayez_core_start(handle_, req.c_str());
        std::string s(c ? c : "{}");
        if (c) v2rayez_free_string(c);
        return s;
    }

    std::string stop() {
        if (!handle_) return "{}";
        char* c = v2rayez_core_stop(handle_);
        std::string s(c ? c : "{}");
        if (c) v2rayez_free_string(c);
        return s;
    }
};

} // namespace V2RayEZ
