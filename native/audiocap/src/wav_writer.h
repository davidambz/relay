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

#include <cstdint>
#include <cstdio>
#include <span>
#include <string>

namespace relay {

// Writes a 32-bit IEEE float WAV (WAVE_FORMAT_IEEE_FLOAT, with the cbSize
// field and 'fact' chunk non-PCM formats require). Chunk sizes are patched on
// Close(), so a file from a killed process has a valid layout but zero sizes.
class WavWriter {
   public:
    WavWriter() = default;
    ~WavWriter();
    WavWriter(const WavWriter&) = delete;
    WavWriter& operator=(const WavWriter&) = delete;

    bool Open(const std::wstring& path, uint32_t sample_rate, uint16_t channels);
    bool Write(std::span<const float> samples);
    bool Close();

   private:
    FILE* file_ = nullptr;
    uint32_t sample_rate_ = 0;
    uint16_t channels_ = 0;
    uint64_t data_bytes_ = 0;
};

}  // namespace relay
