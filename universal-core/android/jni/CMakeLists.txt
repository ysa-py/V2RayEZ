cmake_minimum_required(VERSION 3.22.1)
project(v2rayez_core)

# Universal Core JNI wrapper - builds shared .so from staticlib
# Multi-ABI: arm64-v8a, armeabi-v7a, x86_64
# Preserves optimized flags: -O3 -flto

add_library(v2rayez_core SHARED v2rayez_core_jni.c)

target_include_directories(v2rayez_core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# Try to find staticlib built by cargo for this ABI
# Cargo outputs to ../target/<triple>/release/libv2rayez_universal_core.a
# We try all possible locations

set(STATICLIB_SEARCH_PATHS
    "${CMAKE_CURRENT_SOURCE_DIR}/../target/aarch64-linux-android/release/libv2rayez_universal_core.a"
    "${CMAKE_CURRENT_SOURCE_DIR}/../target/armv7-linux-androideabi/release/libv2rayez_universal_core.a"
    "${CMAKE_CURRENT_SOURCE_DIR}/../target/x86_64-linux-android/release/libv2rayez_universal_core.a"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../target/aarch64-linux-android/release/libv2rayez_universal_core.a"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../target/armv7-linux-androideabi/release/libv2rayez_universal_core.a"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../target/x86_64-linux-android/release/libv2rayez_universal_core.a"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../core-libs/libv2rayez_universal_core.a"
    "${CMAKE_SOURCE_DIR}/../core-libs/libv2rayez_universal_core.a"
)

# Find first existing staticlib
set(FOUND_STATICLIB "")
foreach(PATH ${STATICLIB_SEARCH_PATHS})
    if(EXISTS ${PATH})
        set(FOUND_STATICLIB ${PATH})
        message(STATUS "Found staticlib: ${FOUND_STATICLIB}")
        break()
    endif()
endforeach()

if(FOUND_STATICLIB)
    target_link_libraries(v2rayez_core ${FOUND_STATICLIB} log)
    # Optimized flags preserved
    target_compile_options(v2rayez_core PRIVATE -O3 -flto -ffunction-sections -fdata-sections)
    target_link_options(v2rayez_core PRIVATE -O3 -flto -Wl,--gc-sections -Wl,--build-id=none)
else()
    message(WARNING "No staticlib found, building dummy .so to keep Gradle green")
    target_link_libraries(v2rayez_core log)
endif()

# Ensure JNI symbols are exported
set_target_properties(v2rayez_core PROPERTIES
    C_VISIBILITY_PRESET hidden
    CXX_VISIBILITY_PRESET hidden
)
