cmake_minimum_required(VERSION 3.4.1)
# Assumes universal-core staticlib is built at ../target/debug/libv2rayez_universal_core.a
add_library(v2rayez_core SHARED v2rayez_core_jni.c)
target_include_directories(v2rayez_core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/..)
target_link_libraries(v2rayez_core
    ${CMAKE_CURRENT_SOURCE_DIR}/../target/debug/libv2rayez_universal_core.a
    log)
