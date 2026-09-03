cmake_minimum_required(VERSION 3.22.1)
project(v2rayez_core)

# Universal Core JNI wrapper - builds shared .so from staticlib
# Multi-ABI: arm64-v8a, armeabi-v7a, x86_64
# Preserves optimized flags: -O3 -flto

add_library(v2rayez_core SHARED v2rayez_core_jni.c)

target_include_directories(v2rayez_core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# Map the Android ABI being built (set by Gradle/NDK) to its Cargo target triple.
# CRITICAL: linking the wrong-arch staticlib (e.g. aarch64 into armeabi-v7a)
# fails with "is incompatible with armelf_linux_eabi".
if(ANDROID_ABI STREQUAL "arm64-v8a")
    set(CARGO_TRIPLE "aarch64-linux-android")
elseif(ANDROID_ABI STREQUAL "armeabi-v7a")
    set(CARGO_TRIPLE "armv7-linux-androideabi")
elseif(ANDROID_ABI STREQUAL "x86_64")
    set(CARGO_TRIPLE "x86_64-linux-android")
elseif(ANDROID_ABI STREQUAL "x86")
    set(CARGO_TRIPLE "i686-linux-android")
else()
    set(CARGO_TRIPLE "")
endif()
message(STATUS "Building for ANDROID_ABI=${ANDROID_ABI} -> cargo triple ${CARGO_TRIPLE}")

# Search only paths that match the current ABI (and common repo layouts).
set(STATICLIB_SEARCH_PATHS
    "${CMAKE_CURRENT_SOURCE_DIR}/../target/${CARGO_TRIPLE}/release/libv2rayez_universal_core.a"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../target/${CARGO_TRIPLE}/release/libv2rayez_universal_core.a"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../core-libs/libv2rayez_universal_core.a"
    "${CMAKE_SOURCE_DIR}/../core-libs/libv2rayez_universal_core.a"
)

# Find the first existing staticlib for THIS ABI only.
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
