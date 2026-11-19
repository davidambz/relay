cmake_minimum_required(VERSION 3.21)

project(winlist CXX)

if(NOT WIN32)
    message(FATAL_ERROR "winlist enumerates Win32 top-level windows and only builds on Windows")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Static CRT, so winlist.exe ships as a single file next to the Electron app
# without needing the VC++ redistributable.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_executable(winlist
    src/main.cpp
    src/foreground.cpp
    src/foreground.h
    src/json_writer.cpp
    src/json_writer.h
    src/window_list.cpp
    src/window_list.h
)

target_compile_definitions(winlist PRIVATE
    UNICODE
    _UNICODE
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    _WIN32_WINNT=0x0A00
)

if(MSVC)
    target_compile_options(winlist PRIVATE /W4 /permissive- /utf-8)
endif()

target_link_libraries(winlist PRIVATE user32 dwmapi)
