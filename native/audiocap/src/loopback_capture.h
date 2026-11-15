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

#pragma once

#include <audioclient.h>
#include <windows.h>
#include <wrl/client.h>

#include <cstdint>
#include <functional>
#include <span>
#include <string>
#include <vector>

namespace relay {

// Output format of every capture, whatever WASAPI actually accepted: the
// sink always receives interleaved float32, 48 kHz, stereo.
inline constexpr uint32_t kSampleRate = 48000;
inline constexpr uint16_t kChannels = 2;

enum class LoopbackMode {
    kIncludeTree,  // PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
    kExcludeTree,  // PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE
};

// Formats passed to IAudioClient::Initialize. Process loopback has no mix
// format (GetMixFormat returns E_NOTIMPL), so the format must be chosen here.
enum class CaptureFormat {
    kAuto,              // try the ones below in order, first success wins
    kFloat,             // WAVE_FORMAT_IEEE_FLOAT
    kFloatExtensible,   // WAVE_FORMAT_EXTENSIBLE + KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
    kFloatAutoconvert,  // WAVE_FORMAT_IEEE_FLOAT + AUTOCONVERTPCM | SRC_DEFAULT_QUALITY
    kPcm16,             // WAVE_FORMAT_PCM 16-bit (what Microsoft's sample uses)
};

const char* CaptureFormatName(CaptureFormat format);

// Receives interleaved float32 48 kHz stereo samples. Returning false stops
// the capture (e.g. stdout pipe closed).
using SampleSink = std::function<bool(std::span<const float>)>;

struct CaptureStats {
    uint64_t packets = 0;
    uint64_t frames = 0;
    uint64_t silent_packets = 0;
    uint64_t discontinuities = 0;
};

// Formats an HRESULT as "0x8889000A (AUDCLNT_E_...)" when it's a known
// audio error, or with the system message otherwise.
std::string DescribeHresult(HRESULT hr);

class LoopbackCapture {
   public:
    LoopbackCapture() = default;
    ~LoopbackCapture();
    LoopbackCapture(const LoopbackCapture&) = delete;
    LoopbackCapture& operator=(const LoopbackCapture&) = delete;

    // Activates the process-loopback client and initializes it with
    // `format` (or each candidate in turn for kAuto). Progress and failures
    // are logged to stderr. COM must already be initialized (MTA).
    HRESULT Initialize(DWORD target_pid, LoopbackMode mode, CaptureFormat format);

    // The format Initialize settled on. Valid after a successful Initialize.
    CaptureFormat format() const { return format_; }

    // Starts the stream and pumps packets into `sink` until `stop_event` is
    // signaled, the sink returns false, or WASAPI reports an error.
    HRESULT Run(HANDLE stop_event, const SampleSink& sink);

    const CaptureStats& stats() const { return stats_; }

   private:
    // `activated` reports whether activation succeeded, so kAuto can stop
    // early when the failure isn't about the format.
    HRESULT TryInitialize(DWORD target_pid, LoopbackMode mode, CaptureFormat format,
                          bool* activated);

    Microsoft::WRL::ComPtr<IAudioClient> client_;
    Microsoft::WRL::ComPtr<IAudioCaptureClient> capture_;
    HANDLE sample_ready_ = nullptr;
    CaptureFormat format_ = CaptureFormat::kAuto;
    CaptureStats stats_;
    std::vector<float> scratch_;
};

// Activates a process-loopback IAudioClient via ActivateAudioInterfaceAsync
// and blocks until the completion handler fires.
HRESULT ActivateProcessLoopbackClient(DWORD target_pid, LoopbackMode mode, IAudioClient** client);

}  // namespace relay
