// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { RelayDesktopApi } from "../shared/api";

const workletUrl = new URL("./pcm-worklet.js", import.meta.url);

/** Resolves with the MessagePort preload forwards after main starts audiocap. */
function nextAudioPort(): Promise<MessagePort> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || (event.data as { type?: string })?.type !== "relay-audio-port") return;
      window.removeEventListener("message", onMessage);
      resolve(event.ports[0]);
    };
    window.addEventListener("message", onMessage);
  });
}

/**
 * Starts system audio for a capture source and returns it as a
 * MediaStream audio track. Stopping the track stops audiocap too.
 */
export async function startSystemAudio(api: RelayDesktopApi, sourceId: string): Promise<MediaStreamTrack> {
  const portReady = nextAudioPort();
  const captureId = await api.audioStart(sourceId);
  const port = await portReady;

  const context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
  await context.audioWorklet.addModule(workletUrl);
  const player = new AudioWorkletNode(context, "relay-pcm-player", { numberOfInputs: 0, outputChannelCount: [2] });
  const destination = context.createMediaStreamDestination();
  destination.channelCount = 2;
  player.connect(destination);

  port.onmessage = (event: MessageEvent<ArrayBuffer>) => player.port.postMessage(event.data, [event.data]);
  port.start();

  const [track] = destination.stream.getAudioTracks();
  track.contentHint = "music";
  // Everyone who ends a broadcast already calls track.stop() on every
  // track; hook it so that also tears down audiocap and the audio graph.
  const stopTrack = track.stop.bind(track);
  track.stop = () => {
    stopTrack();
    port.close();
    // Only this capture: after a source switch the new one is already
    // running when the old track gets stopped.
    void api.audioStop(captureId);
    void context.close();
  };
  return track;
}
