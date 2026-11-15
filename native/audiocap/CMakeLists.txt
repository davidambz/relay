cmake_minimum_required(VERSION 3.21)

project(audiocap CXX)

if(NOT WIN32)
    message(FATAL_ERROR "audiocap uses WASAPI process loopback and only builds on Windows")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Static CRT, so audiocap.exe ships as a single file next to the Electron app
# without needing the VC++ redistributable.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_executable(audiocap
    src/main.cpp
    src/loopback_capture.cpp
    src/loopback_capture.h
    src/process_util.cpp
    src/process_util.h
    src/wav_writer.cpp
    src/wav_writer.h
)

target_compile_definitions(audiocap PRIVATE
    UNICODE
    _UNICODE
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    # The process-loopback declarations in audioclientactivationparams.h are
    # gated behind NTDDI_WIN10_FE, even though the API itself works from
    # Windows 10 2004 (build 19041). audiocap checks the real build at runtime.
    _WIN32_WINNT=0x0A00
    NTDDI_VERSION=0x0A00000A
)

if(MSVC)
    target_compile_options(audiocap PRIVATE /W4 /permissive- /utf-8)
endif()

target_link_libraries(audiocap PRIVATE mmdevapi ole32 uuid)
