// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

// Plays interleaved float32 stereo PCM pushed from the main thread (from
// audiocap) into the Web Audio graph, which turns it into a MediaStream
// track for the broadcast.
//
// The ring buffer is deliberately small: the pipe from audiocap is local
// and reliable, so any extra buffering would only delay sound relative
// to video (WebRTC's lip sync can't compensate for it). It primes to
// ~30 ms, and if it ever grows past ~100 ms (clock drift between the
// capture device and this AudioContext) it skips ahead to stay in sync.

const TARGET_FRAMES = 1440; // 30 ms at 48 kHz
const MAX_FRAMES = 4800; // 100 ms
const CAPACITY = 48000; // 1 s

class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CAPACITY * 2);
    this.readFrame = 0;
    this.writeFrame = 0;
    this.size = 0;
    this.primed = false;
    this.port.onmessage = (event) => this.push(new Float32Array(event.data));
  }

  push(samples) {
    const frames = samples.length / 2;
    for (let i = 0; i < frames; i++) {
      this.buffer[this.writeFrame * 2] = samples[i * 2];
      this.buffer[this.writeFrame * 2 + 1] = samples[i * 2 + 1];
      this.writeFrame = (this.writeFrame + 1) % CAPACITY;
    }
    this.size += frames;
    if (this.size > MAX_FRAMES) {
      const skip = this.size - TARGET_FRAMES;
      this.readFrame = (this.readFrame + skip) % CAPACITY;
      this.size -= skip;
    }
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    if (!this.primed && this.size < TARGET_FRAMES) return true; // outputs stay silent
    this.primed = true;
    for (let i = 0; i < left.length; i++) {
      if (this.size === 0) {
        // Underrun: go silent and re-prime rather than crackle.
        this.primed = false;
        left[i] = 0;
        if (right) right[i] = 0;
        continue;
      }
      left[i] = this.buffer[this.readFrame * 2];
      if (right) right[i] = this.buffer[this.readFrame * 2 + 1];
      this.readFrame = (this.readFrame + 1) % CAPACITY;
      this.size--;
    }
    return true;
  }
}

registerProcessor("relay-pcm-player", PcmPlayer);
