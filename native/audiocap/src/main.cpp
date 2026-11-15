// Relay
// Copyright (C) 2026 David Ambrozio
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

// audiocap: captures audio with WASAPI process loopback and writes raw
// interleaved float32 48 kHz stereo PCM to stdout (or a .wav with --wav).
// Stage-1 prototype for Relay's "audio without Discord" requirement.

#include <fcntl.h>
#include <io.h>
#include <objbase.h>
#include <windows.h>

#include <cstdio>
#include <cstdlib>
#include <cwchar>
#include <optional>
#include <string>

#include "loopback_capture.h"
#include "process_util.h"
#include "wav_writer.h"

namespace {

using relay::CaptureFormat;
using relay::LoopbackMode;

constexpr DWORD kMinimumBuild = 19041;  // Windows 10 2004

// Exit codes, so the Electron side can tell failures apart.
constexpr int kExitOk = 0;
constexpr int kExitNotFound = 1;  // --find-discord: not running
constexpr int kExitUsage = 2;
constexpr int kExitUnsupportedOs = 3;
constexpr int kExitAudioError = 4;
constexpr int kExitIoError = 5;

HANDLE g_stop_event = nullptr;

enum class Command { kCapture, kFindDiscord, kProbeFormats, kHelp };

struct Options {
    Command command = Command::kCapture;
    std::optional<LoopbackMode> mode;
    DWORD pid = 0;
    bool system = false;
    std::wstring wav_path;
    double seconds = 0;
    CaptureFormat format = CaptureFormat::kAuto;
    bool ignore_stdin = false;
};

void PrintUsage() {
    fputs(
        "usage: audiocap (--include <pid> | --exclude <pid> | --system)\n"
        "                [--wav <path>] [--seconds N] [--format F] [--ignore-stdin]\n"
        "       audiocap --find-discord\n"
        "       audiocap --probe-formats (--include <pid> | --exclude <pid> | --system)\n"
        "\n"
        "  --include <pid>  capture only <pid> and its child processes\n"
        "  --exclude <pid>  capture everything except <pid> and its child processes\n"
        "  --system         capture everything except audiocap itself\n"
        "                   (process loopback, exclude mode on our own PID)\n"
        "  --wav <path>     write a 32-bit float WAV instead of raw PCM on stdout\n"
        "  --seconds N      stop after N seconds (default: run until stopped)\n"
        "  --format F       auto (default), float, float-ext, float-autoconvert, pcm16\n"
        "  --ignore-stdin   don't stop when stdin (a pipe) reaches EOF\n"
        "  --find-discord   print the root PID of Discord/DiscordPTB/DiscordCanary,\n"
        "                   exit 1 if none is running\n"
        "  --probe-formats  try every --format against the target and report results\n"
        "\n"
        "Output (stdout, unless --wav): raw interleaved float32 little-endian, 48000 Hz,\n"
        "2 channels. Stops on Ctrl+C, stdin EOF, --seconds or a closed stdout.\n",
        stderr);
}

bool ParsePid(const wchar_t* text, DWORD* pid) {
    wchar_t* end = nullptr;
    unsigned long value = wcstoul(text, &end, 10);
    if (end == text || *end != L'\0' || value == 0 || value > MAXDWORD) {
        return false;
    }
    *pid = static_cast<DWORD>(value);
    return true;
}

bool ParseFormat(const wchar_t* text, CaptureFormat* format) {
    struct Entry {
        const wchar_t* name;
        CaptureFormat format;
    };
    constexpr Entry kFormats[] = {
        {L"auto", CaptureFormat::kAuto},
        {L"float", CaptureFormat::kFloat},
        {L"float-ext", CaptureFormat::kFloatExtensible},
        {L"float-autoconvert", CaptureFormat::kFloatAutoconvert},
        {L"pcm16", CaptureFormat::kPcm16},
    };
    for (const Entry& entry : kFormats) {
        if (wcscmp(text, entry.name) == 0) {
            *format = entry.format;
            return true;
        }
    }
    return false;
}

std::optional<Options> ParseArgs(int argc, wchar_t** argv) {
    Options options;
    int targets = 0;
    for (int i = 1; i < argc; ++i) {
        const std::wstring arg = argv[i];
        auto next = [&]() -> const wchar_t* {
            if (i + 1 >= argc) {
                fwprintf(stderr, L"audiocap: %ls needs a value\n", arg.c_str());
                return nullptr;
            }
            return argv[++i];
        };
        if (arg == L"--include" || arg == L"--exclude") {
            const wchar_t* value = next();
            if (value == nullptr || !ParsePid(value, &options.pid)) {
                fwprintf(stderr, L"audiocap: %ls needs a numeric PID\n", arg.c_str());
                return std::nullopt;
            }
            options.mode =
                arg == L"--include" ? LoopbackMode::kIncludeTree : LoopbackMode::kExcludeTree;
            ++targets;
        } else if (arg == L"--system") {
            options.system = true;
            options.mode = LoopbackMode::kExcludeTree;
            options.pid = GetCurrentProcessId();
            ++targets;
        } else if (arg == L"--wav") {
            const wchar_t* value = next();
            if (value == nullptr) {
                return std::nullopt;
            }
            options.wav_path = value;
        } else if (arg == L"--seconds") {
            const wchar_t* value = next();
            if (value == nullptr) {
                return std::nullopt;
            }
            wchar_t* end = nullptr;
            options.seconds = wcstod(value, &end);
            if (end == value || *end != L'\0' || options.seconds <= 0) {
                fputs("audiocap: --seconds needs a positive number\n", stderr);
                return std::nullopt;
            }
        } else if (arg == L"--format") {
            const wchar_t* value = next();
            if (value == nullptr || !ParseFormat(value, &options.format)) {
                fputs("audiocap: unknown --format\n", stderr);
                return std::nullopt;
            }
        } else if (arg == L"--ignore-stdin") {
            options.ignore_stdin = true;
        } else if (arg == L"--find-discord") {
            options.command = Command::kFindDiscord;
        } else if (arg == L"--probe-formats") {
            options.command = Command::kProbeFormats;
        } else if (arg == L"--help" || arg == L"-h" || arg == L"/?") {
            options.command = Command::kHelp;
        } else {
            fwprintf(stderr, L"audiocap: unknown argument %ls\n", arg.c_str());
            return std::nullopt;
        }
    }
    if (options.command == Command::kCapture || options.command == Command::kProbeFormats) {
        if (targets != 1) {
            fputs("audiocap: pass exactly one of --include, --exclude, --system\n", stderr);
            return std::nullopt;
        }
    }
    return options;
}

BOOL WINAPI OnConsoleCtrl(DWORD type) {
    switch (type) {
        case CTRL_C_EVENT:
        case CTRL_BREAK_EVENT:
        case CTRL_CLOSE_EVENT:
        case CTRL_LOGOFF_EVENT:
        case CTRL_SHUTDOWN_EVENT:
            SetEvent(g_stop_event);
            // For CLOSE/LOGOFF/SHUTDOWN the process is killed once this
            // returns; give the main thread a moment to finalize the WAV.
            if (type != CTRL_C_EVENT && type != CTRL_BREAK_EVENT) {
                Sleep(500);
            }
            return TRUE;
        default:
            return FALSE;
    }
}

// The parent (Electron) stops us by closing our stdin. Only watched when
// stdin is a pipe: a console or NUL stdin isn't a stop signal.
DWORD WINAPI WatchStdin(void*) {
    HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
    char buffer[256];
    DWORD read = 0;
    while (ReadFile(in, buffer, sizeof(buffer), &read, nullptr) && read > 0) {
    }
    SetEvent(g_stop_event);
    return 0;
}

void CALLBACK OnDeadline(void*, BOOLEAN) { SetEvent(g_stop_event); }

bool WriteAll(HANDLE out, const void* data, size_t size) {
    const auto* bytes = static_cast<const BYTE*>(data);
    while (size > 0) {
        DWORD chunk = size > MAXDWORD ? MAXDWORD : static_cast<DWORD>(size);
        DWORD written = 0;
        if (!WriteFile(out, bytes, chunk, &written, nullptr)) {
            return false;
        }
        bytes += written;
        size -= written;
    }
    return true;
}

bool ProcessExists(DWORD pid) {
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (process != nullptr) {
        DWORD code = 0;
        bool alive = GetExitCodeProcess(process, &code) && code == STILL_ACTIVE;
        CloseHandle(process);
        return alive;
    }
    // Protected/elevated processes refuse the handle but do exist.
    return GetLastError() == ERROR_ACCESS_DENIED;
}

int FindDiscord() {
    std::wstring name;
    std::optional<DWORD> pid = relay::FindDiscordRootPid(&name);
    if (!pid) {
        fputs("audiocap: Discord is not running\n", stderr);
        return kExitNotFound;
    }
    printf("%lu\n", static_cast<unsigned long>(*pid));
    fwprintf(stderr, L"audiocap: %ls root PID %lu\n", name.c_str(),
             static_cast<unsigned long>(*pid));
    return kExitOk;
}

int ProbeFormats(const Options& options) {
    constexpr CaptureFormat kFormats[] = {CaptureFormat::kFloat, CaptureFormat::kFloatExtensible,
                                          CaptureFormat::kFloatAutoconvert, CaptureFormat::kPcm16};
    int accepted = 0;
    for (CaptureFormat format : kFormats) {
        relay::LoopbackCapture capture;
        HRESULT hr = capture.Initialize(options.pid, *options.mode, format);
        printf("%-4s %s%s%s\n", SUCCEEDED(hr) ? "OK" : "FAIL", relay::CaptureFormatName(format),
               SUCCEEDED(hr) ? "" : "  ", SUCCEEDED(hr) ? "" : relay::DescribeHresult(hr).c_str());
        accepted += SUCCEEDED(hr) ? 1 : 0;
    }
    return accepted > 0 ? kExitOk : kExitAudioError;
}

int Capture(const Options& options) {
    // Activation happily succeeds for a PID that doesn't exist (it just
    // captures silence), so check it up front to surface typos and races.
    if (!options.system && !ProcessExists(options.pid)) {
        fprintf(stderr, "audiocap: no process with PID %lu\n",
                static_cast<unsigned long>(options.pid));
        return kExitUsage;
    }
    relay::LoopbackCapture capture;
    HRESULT hr = capture.Initialize(options.pid, *options.mode, options.format);
    if (FAILED(hr)) {
        fprintf(stderr, "audiocap: could not start process loopback capture: %s\n",
                relay::DescribeHresult(hr).c_str());
        return kExitAudioError;
    }
    fprintf(stderr, "audiocap: %s pid %lu%s, Initialize accepted %s\n",
            *options.mode == LoopbackMode::kIncludeTree ? "including" : "excluding",
            static_cast<unsigned long>(options.pid), options.system ? " (self, --system)" : "",
            relay::CaptureFormatName(capture.format()));

    relay::WavWriter wav;
    HANDLE out = INVALID_HANDLE_VALUE;
    if (!options.wav_path.empty()) {
        if (!wav.Open(options.wav_path, relay::kSampleRate, relay::kChannels)) {
            fwprintf(stderr, L"audiocap: cannot open %ls for writing\n", options.wav_path.c_str());
            return kExitIoError;
        }
    } else {
        _setmode(_fileno(stdout), _O_BINARY);
        out = GetStdHandle(STD_OUTPUT_HANDLE);
    }

    bool io_error = false;
    relay::SampleSink sink = [&](std::span<const float> samples) {
        bool ok = options.wav_path.empty() ? WriteAll(out, samples.data(), samples.size_bytes())
                                           : wav.Write(samples);
        if (!ok) {
            // A closed stdout pipe is a normal way for the parent to stop us.
            io_error = !options.wav_path.empty();
        }
        return ok;
    };

    HANDLE timer = nullptr;
    if (options.seconds > 0) {
        CreateTimerQueueTimer(&timer, nullptr, OnDeadline, nullptr,
                              static_cast<DWORD>(options.seconds * 1000), 0, WT_EXECUTEONLYONCE);
    }
    hr = capture.Run(g_stop_event, sink);
    if (timer != nullptr) {
        DeleteTimerQueueTimer(nullptr, timer, INVALID_HANDLE_VALUE);
    }

    const relay::CaptureStats& stats = capture.stats();
    fprintf(stderr,
            "audiocap: stopped: %llu packets, %llu frames (%.2f s of audio), %llu silent packets, "
            "%llu discontinuities\n",
            static_cast<unsigned long long>(stats.packets),
            static_cast<unsigned long long>(stats.frames),
            static_cast<double>(stats.frames) / relay::kSampleRate,
            static_cast<unsigned long long>(stats.silent_packets),
            static_cast<unsigned long long>(stats.discontinuities));

    if (!options.wav_path.empty() && !wav.Close()) {
        fwprintf(stderr, L"audiocap: failed to finalize %ls\n", options.wav_path.c_str());
        return kExitIoError;
    }
    if (io_error) {
        fputs("audiocap: write failed\n", stderr);
        return kExitIoError;
    }
    return FAILED(hr) ? kExitAudioError : kExitOk;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    std::optional<Options> options = ParseArgs(argc, argv);
    if (!options) {
        PrintUsage();
        return kExitUsage;
    }
    if (options->command == Command::kHelp) {
        PrintUsage();
        return kExitOk;
    }
    if (options->command == Command::kFindDiscord) {
        return FindDiscord();
    }

    const DWORD build = relay::GetWindowsBuildNumber();
    if (build < kMinimumBuild) {
        fprintf(stderr,
                "audiocap: process loopback capture needs Windows 10 version 2004 (build %lu) or "
                "newer; this is build %lu\n",
                static_cast<unsigned long>(kMinimumBuild), static_cast<unsigned long>(build));
        return kExitUnsupportedOs;
    }

    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr)) {
        fprintf(stderr, "audiocap: CoInitializeEx failed: %s\n",
                relay::DescribeHresult(hr).c_str());
        return kExitAudioError;
    }

    g_stop_event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    SetConsoleCtrlHandler(OnConsoleCtrl, TRUE);

    int exit_code;
    if (options->command == Command::kProbeFormats) {
        exit_code = ProbeFormats(*options);
    } else {
        HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
        if (!options->ignore_stdin && in != nullptr && in != INVALID_HANDLE_VALUE &&
            GetFileType(in) == FILE_TYPE_PIPE) {
            HANDLE thread = CreateThread(nullptr, 0, WatchStdin, nullptr, 0, nullptr);
            if (thread != nullptr) {
                CloseHandle(thread);
            }
        }
        exit_code = Capture(*options);
    }

    CoUninitialize();
    // The stdin watcher may still be blocked in ReadFile; don't wait for it.
    fflush(stdout);
    fflush(stderr);
    ExitProcess(static_cast<UINT>(exit_code));
}
