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

#include "wav_writer.h"

#include <limits>

namespace relay {

namespace {

constexpr uint16_t kWaveFormatIeeeFloat = 3;
constexpr uint16_t kBitsPerSample = 32;
// RIFF(12) + fmt chunk(8 + 18) + fact chunk(8 + 4) + data header(8).
constexpr long kRiffSizeOffset = 4;
constexpr long kFactSampleCountOffset = 12 + 26 + 8;
constexpr long kDataSizeOffset = kFactSampleCountOffset + 4 + 4;
constexpr uint32_t kHeaderBytes = 12 + 26 + 12 + 8;

void Put16(FILE* f, uint16_t v) { fwrite(&v, sizeof(v), 1, f); }
void Put32(FILE* f, uint32_t v) { fwrite(&v, sizeof(v), 1, f); }
void PutTag(FILE* f, const char* tag) { fwrite(tag, 1, 4, f); }

}  // namespace

WavWriter::~WavWriter() { Close(); }

bool WavWriter::Open(const std::wstring& path, uint32_t sample_rate, uint16_t channels) {
    Close();
    if (_wfopen_s(&file_, path.c_str(), L"wb") != 0 || file_ == nullptr) {
        file_ = nullptr;
        return false;
    }
    sample_rate_ = sample_rate;
    channels_ = channels;
    data_bytes_ = 0;

    const uint16_t block_align = static_cast<uint16_t>(channels * kBitsPerSample / 8);
    PutTag(file_, "RIFF");
    Put32(file_, 0);  // patched on Close()
    PutTag(file_, "WAVE");

    PutTag(file_, "fmt ");
    Put32(file_, 18);
    Put16(file_, kWaveFormatIeeeFloat);
    Put16(file_, channels);
    Put32(file_, sample_rate);
    Put32(file_, sample_rate * block_align);
    Put16(file_, block_align);
    Put16(file_, kBitsPerSample);
    Put16(file_, 0);  // cbSize

    PutTag(file_, "fact");
    Put32(file_, 4);
    Put32(file_, 0);  // sample frames per channel, patched on Close()

    PutTag(file_, "data");
    Put32(file_, 0);  // patched on Close()
    return ferror(file_) == 0;
}

bool WavWriter::Write(std::span<const float> samples) {
    if (file_ == nullptr) {
        return false;
    }
    size_t written = fwrite(samples.data(), sizeof(float), samples.size(), file_);
    data_bytes_ += written * sizeof(float);
    return written == samples.size();
}

bool WavWriter::Close() {
    if (file_ == nullptr) {
        return true;
    }
    // RIFF sizes are 32-bit; clamp instead of wrapping on absurdly long runs.
    const uint64_t max_data = std::numeric_limits<uint32_t>::max() - kHeaderBytes;
    const uint32_t data = static_cast<uint32_t>(data_bytes_ > max_data ? max_data : data_bytes_);
    const uint32_t frames = data / (channels_ * (kBitsPerSample / 8));

    bool ok = true;
    ok &= fseek(file_, kRiffSizeOffset, SEEK_SET) == 0;
    Put32(file_, kHeaderBytes - 8 + data);
    ok &= fseek(file_, kFactSampleCountOffset, SEEK_SET) == 0;
    Put32(file_, frames);
    ok &= fseek(file_, kDataSizeOffset, SEEK_SET) == 0;
    Put32(file_, data);
    ok &= ferror(file_) == 0;
    ok &= fclose(file_) == 0;
    file_ = nullptr;
    return ok;
}

}  // namespace relay
