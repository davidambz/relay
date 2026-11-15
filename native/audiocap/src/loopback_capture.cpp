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

#include "loopback_capture.h"

#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <mmreg.h>

#include <atomic>
#include <cstdio>
#include <cstring>

using Microsoft::WRL::ComPtr;

namespace relay {

namespace {

// KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, spelled out so we don't depend on
// INITGUID/ksuser.lib for one GUID.
constexpr GUID kSubtypeIeeeFloat = {
    0x00000003, 0x0000, 0x0010, {0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71}};

// 20 ms, like Microsoft's ApplicationLoopback sample. In event-driven shared
// mode this is a hint; the engine period decides how often we're woken up.
constexpr REFERENCE_TIME kBufferDuration = 20 * 10000;

constexpr DWORD kActivationTimeoutMs = 10000;

// Completion handler for ActivateAudioInterfaceAsync. It must be agile
// (IAgileObject): Windows invokes it on an arbitrary MTA worker thread and
// fails activation with E_ILLEGAL_METHOD_CALL otherwise.
class ActivationHandler final : public IActivateAudioInterfaceCompletionHandler,
                                public IAgileObject {
   public:
    ActivationHandler() : done_(CreateEventW(nullptr, TRUE, FALSE, nullptr)) {}
    ~ActivationHandler() {
        if (done_ != nullptr) {
            CloseHandle(done_);
        }
    }

    HANDLE done() const { return done_; }
    HRESULT result() const { return result_; }
    ComPtr<IUnknown> interface_ptr() const { return interface_; }

    // IUnknown
    STDMETHODIMP QueryInterface(REFIID riid, void** out) override {
        if (out == nullptr) {
            return E_POINTER;
        }
        if (riid == __uuidof(IUnknown) ||
            riid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
            *out = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
        } else if (riid == __uuidof(IAgileObject)) {
            *out = static_cast<IAgileObject*>(this);
        } else {
            *out = nullptr;
            return E_NOINTERFACE;
        }
        AddRef();
        return S_OK;
    }
    STDMETHODIMP_(ULONG) AddRef() override { return ++refs_; }
    STDMETHODIMP_(ULONG) Release() override {
        ULONG refs = --refs_;
        if (refs == 0) {
            delete this;
        }
        return refs;
    }

    // IActivateAudioInterfaceCompletionHandler
    STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
        HRESULT activate_hr = E_UNEXPECTED;
        ComPtr<IUnknown> unknown;
        HRESULT hr = operation->GetActivateResult(&activate_hr, &unknown);
        result_ = FAILED(hr) ? hr : activate_hr;
        if (SUCCEEDED(result_)) {
            interface_ = unknown;
        }
        SetEvent(done_);
        return S_OK;
    }

   private:
    std::atomic<ULONG> refs_{1};
    HANDLE done_;
    HRESULT result_ = E_PENDING;
    ComPtr<IUnknown> interface_;
};

WAVEFORMATEXTENSIBLE BuildFormat(CaptureFormat format) {
    WAVEFORMATEXTENSIBLE wfx{};
    WAVEFORMATEX& f = wfx.Format;
    f.nChannels = kChannels;
    f.nSamplesPerSec = kSampleRate;
    switch (format) {
        case CaptureFormat::kPcm16:
            f.wFormatTag = WAVE_FORMAT_PCM;
            f.wBitsPerSample = 16;
            break;
        case CaptureFormat::kFloatExtensible:
            f.wFormatTag = WAVE_FORMAT_EXTENSIBLE;
            f.wBitsPerSample = 32;
            f.cbSize = sizeof(WAVEFORMATEXTENSIBLE) - sizeof(WAVEFORMATEX);
            wfx.Samples.wValidBitsPerSample = 32;
            wfx.dwChannelMask = SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT;
            wfx.SubFormat = kSubtypeIeeeFloat;
            break;
        default:
            f.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
            f.wBitsPerSample = 32;
            break;
    }
    f.nBlockAlign = static_cast<WORD>(f.nChannels * f.wBitsPerSample / 8);
    f.nAvgBytesPerSec = f.nSamplesPerSec * f.nBlockAlign;
    return wfx;
}

const char* KnownAudioError(HRESULT hr) {
    switch (hr) {
        case AUDCLNT_E_NOT_INITIALIZED:
            return "AUDCLNT_E_NOT_INITIALIZED";
        case AUDCLNT_E_ALREADY_INITIALIZED:
            return "AUDCLNT_E_ALREADY_INITIALIZED";
        case AUDCLNT_E_WRONG_ENDPOINT_TYPE:
            return "AUDCLNT_E_WRONG_ENDPOINT_TYPE";
        case AUDCLNT_E_DEVICE_INVALIDATED:
            return "AUDCLNT_E_DEVICE_INVALIDATED";
        case AUDCLNT_E_NOT_STOPPED:
            return "AUDCLNT_E_NOT_STOPPED";
        case AUDCLNT_E_UNSUPPORTED_FORMAT:
            return "AUDCLNT_E_UNSUPPORTED_FORMAT";
        case AUDCLNT_E_INVALID_STREAM_FLAG:
            return "AUDCLNT_E_INVALID_STREAM_FLAG";
        case AUDCLNT_E_DEVICE_IN_USE:
            return "AUDCLNT_E_DEVICE_IN_USE";
        case AUDCLNT_E_SERVICE_NOT_RUNNING:
            return "AUDCLNT_E_SERVICE_NOT_RUNNING";
        case AUDCLNT_E_BUFFER_SIZE_ERROR:
            return "AUDCLNT_E_BUFFER_SIZE_ERROR";
        case AUDCLNT_E_ENDPOINT_CREATE_FAILED:
            return "AUDCLNT_E_ENDPOINT_CREATE_FAILED";
        case AUDCLNT_E_INVALID_DEVICE_PERIOD:
            return "AUDCLNT_E_INVALID_DEVICE_PERIOD";
        case E_NOTIMPL:
            return "E_NOTIMPL";
        case E_INVALIDARG:
            return "E_INVALIDARG";
        case E_ILLEGAL_METHOD_CALL:
            return "E_ILLEGAL_METHOD_CALL";
        case E_ACCESSDENIED:
            return "E_ACCESSDENIED";
        case E_POINTER:
            return "E_POINTER";
        default:
            return nullptr;
    }
}

}  // namespace

const char* CaptureFormatName(CaptureFormat format) {
    switch (format) {
        case CaptureFormat::kAuto:
            return "auto";
        case CaptureFormat::kFloat:
            return "float (WAVE_FORMAT_IEEE_FLOAT 48kHz 32-bit stereo)";
        case CaptureFormat::kFloatExtensible:
            return "float-ext (WAVE_FORMAT_EXTENSIBLE/IEEE_FLOAT 48kHz 32-bit stereo)";
        case CaptureFormat::kFloatAutoconvert:
            return "float-autoconvert (WAVE_FORMAT_IEEE_FLOAT + AUTOCONVERTPCM)";
        case CaptureFormat::kPcm16:
            return "pcm16 (WAVE_FORMAT_PCM 48kHz 16-bit stereo)";
    }
    return "?";
}

std::string DescribeHresult(HRESULT hr) {
    char buf[512];
    const char* known = KnownAudioError(hr);
    if (known != nullptr) {
        snprintf(buf, sizeof(buf), "0x%08lX (%s)", static_cast<unsigned long>(hr), known);
        return buf;
    }
    char message[400] = {};
    DWORD len = FormatMessageA(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, nullptr,
                               static_cast<DWORD>(hr), 0, message, sizeof(message), nullptr);
    while (len > 0 && (message[len - 1] == '\r' || message[len - 1] == '\n' ||
                       message[len - 1] == ' ' || message[len - 1] == '.')) {
        message[--len] = '\0';
    }
    if (len > 0) {
        snprintf(buf, sizeof(buf), "0x%08lX (%s)", static_cast<unsigned long>(hr), message);
    } else {
        snprintf(buf, sizeof(buf), "0x%08lX", static_cast<unsigned long>(hr));
    }
    return buf;
}

HRESULT ActivateProcessLoopbackClient(DWORD target_pid, LoopbackMode mode, IAudioClient** client) {
    AUDIOCLIENT_ACTIVATION_PARAMS params{};
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId = target_pid;
    params.ProcessLoopbackParams.ProcessLoopbackMode =
        mode == LoopbackMode::kIncludeTree ? PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
                                           : PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

    // The blob points at `params`; it only needs to live until the call
    // returns (the activation copies it).
    PROPVARIANT activate_params{};
    activate_params.vt = VT_BLOB;
    activate_params.blob.cbSize = sizeof(params);
    activate_params.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

    ComPtr<ActivationHandler> handler;
    handler.Attach(new ActivationHandler());
    if (handler->done() == nullptr) {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
    HRESULT hr =
        ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient),
                                    &activate_params, handler.Get(), &operation);
    if (FAILED(hr)) {
        return hr;
    }
    if (WaitForSingleObject(handler->done(), kActivationTimeoutMs) != WAIT_OBJECT_0) {
        return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
    }
    if (FAILED(handler->result())) {
        return handler->result();
    }
    return handler->interface_ptr()->QueryInterface(IID_PPV_ARGS(client));
}

LoopbackCapture::~LoopbackCapture() {
    if (client_) {
        client_->Stop();
    }
    capture_.Reset();
    client_.Reset();
    if (sample_ready_ != nullptr) {
        CloseHandle(sample_ready_);
    }
}

HRESULT LoopbackCapture::TryInitialize(DWORD target_pid, LoopbackMode mode, CaptureFormat format,
                                       bool* activated) {
    // A fresh client per attempt: after a failed Initialize the client's
    // state isn't something to rely on.
    capture_.Reset();
    client_.Reset();
    ComPtr<IAudioClient> client;
    HRESULT hr = ActivateProcessLoopbackClient(target_pid, mode, &client);
    if (FAILED(hr)) {
        fprintf(stderr, "audiocap: ActivateAudioInterfaceAsync failed: %s\n",
                DescribeHresult(hr).c_str());
        return hr;
    }
    *activated = true;

    WAVEFORMATEXTENSIBLE wfx = BuildFormat(format);
    DWORD flags = AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
    if (format == CaptureFormat::kFloatAutoconvert) {
        flags |= AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    }
    hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, kBufferDuration, 0,
                            reinterpret_cast<const WAVEFORMATEX*>(&wfx), nullptr);
    if (FAILED(hr)) {
        fprintf(stderr, "audiocap: Initialize with %s failed: %s\n", CaptureFormatName(format),
                DescribeHresult(hr).c_str());
        return hr;
    }
    hr = client->SetEventHandle(sample_ready_);
    if (FAILED(hr)) {
        fprintf(stderr, "audiocap: SetEventHandle failed: %s\n", DescribeHresult(hr).c_str());
        return hr;
    }
    ComPtr<IAudioCaptureClient> capture;
    hr = client->GetService(IID_PPV_ARGS(&capture));
    if (FAILED(hr)) {
        fprintf(stderr, "audiocap: GetService(IAudioCaptureClient) failed: %s\n",
                DescribeHresult(hr).c_str());
        return hr;
    }
    client_ = std::move(client);
    capture_ = std::move(capture);
    format_ = format;
    return S_OK;
}

HRESULT LoopbackCapture::Initialize(DWORD target_pid, LoopbackMode mode, CaptureFormat format) {
    if (sample_ready_ == nullptr) {
        sample_ready_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        if (sample_ready_ == nullptr) {
            return HRESULT_FROM_WIN32(GetLastError());
        }
    }
    if (format != CaptureFormat::kAuto) {
        bool activated = false;
        return TryInitialize(target_pid, mode, format, &activated);
    }
    constexpr CaptureFormat kCandidates[] = {
        CaptureFormat::kFloat,
        CaptureFormat::kFloatExtensible,
        CaptureFormat::kFloatAutoconvert,
        CaptureFormat::kPcm16,
    };
    HRESULT hr = E_FAIL;
    for (CaptureFormat candidate : kCandidates) {
        bool activated = false;
        hr = TryInitialize(target_pid, mode, candidate, &activated);
        if (SUCCEEDED(hr)) {
            return hr;
        }
        // Activation failures (bad PID, old Windows) won't be fixed by
        // another format; only keep trying when Initialize itself refused.
        if (!activated) {
            return hr;
        }
    }
    return hr;
}

HRESULT LoopbackCapture::Run(HANDLE stop_event, const SampleSink& sink) {
    if (!client_ || !capture_) {
        return AUDCLNT_E_NOT_INITIALIZED;
    }
    HRESULT hr = client_->Start();
    if (FAILED(hr)) {
        fprintf(stderr, "audiocap: IAudioClient::Start failed: %s\n", DescribeHresult(hr).c_str());
        return hr;
    }

    const bool is_pcm16 = format_ == CaptureFormat::kPcm16;
    const HANDLE handles[] = {stop_event, sample_ready_};
    bool keep_going = true;
    while (keep_going) {
        DWORD wait = WaitForMultipleObjects(2, handles, FALSE, INFINITE);
        if (wait == WAIT_OBJECT_0) {
            break;
        }
        if (wait != WAIT_OBJECT_0 + 1) {
            hr = HRESULT_FROM_WIN32(GetLastError());
            break;
        }
        UINT32 packet_frames = 0;
        while (keep_going && SUCCEEDED(hr = capture_->GetNextPacketSize(&packet_frames)) &&
               packet_frames > 0) {
            BYTE* data = nullptr;
            UINT32 frames = 0;
            DWORD flags = 0;
            hr = capture_->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
            if (FAILED(hr)) {
                break;
            }
            const size_t samples = static_cast<size_t>(frames) * kChannels;
            scratch_.resize(samples);
            if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0 || data == nullptr) {
                std::memset(scratch_.data(), 0, samples * sizeof(float));
                ++stats_.silent_packets;
            } else if (is_pcm16) {
                const auto* in = reinterpret_cast<const int16_t*>(data);
                for (size_t i = 0; i < samples; ++i) {
                    scratch_[i] = static_cast<float>(in[i]) / 32768.0f;
                }
            } else {
                std::memcpy(scratch_.data(), data, samples * sizeof(float));
            }
            if ((flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) != 0) {
                ++stats_.discontinuities;
            }
            hr = capture_->ReleaseBuffer(frames);
            if (FAILED(hr)) {
                break;
            }
            ++stats_.packets;
            stats_.frames += frames;
            if (samples > 0 && !sink(std::span<const float>(scratch_.data(), samples))) {
                keep_going = false;
            }
        }
        if (FAILED(hr)) {
            fprintf(stderr, "audiocap: capture failed: %s\n", DescribeHresult(hr).c_str());
            break;
        }
    }
    client_->Stop();
    return FAILED(hr) ? hr : S_OK;
}

}  // namespace relay
