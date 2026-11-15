# Relay

Peer-to-peer screen sharing for Windows. One person broadcasts a monitor or a window, others watch by typing a short code. Video goes straight between the PCs over WebRTC; there's no Relay server in the middle.

## Status

Early development. What works today:

- Source picker with live thumbnails (monitors and windows), quality choice (sharpness or smoothness), and a local preview of what's being captured.
- A native audio helper (`native/audiocap`) that captures one app's sound, or everything except one app (e.g. Discord's voice chat), via WASAPI process loopback.

Still to come: viewer connections, the full player, the floating mini player, audio in the broadcast, the installer and self-updates.

## Running from source

Requires [Node.js](https://nodejs.org/) 22+ on Windows 10 2004 (build 19041) or later.

```sh
npm ci
npm run dev                    # one window
npm run dev -- --instances 2   # two windows: broadcast in one, watch in the other
```

Every copy of Relay you open gets its own profile, so you can run several side by side on one PC to test broadcasting and watching alone.

Other scripts:

```sh
npm test          # unit tests (Vitest)
npm run lint      # oxlint
npm run typecheck
npm run build     # production renderer + Electron bundles
npm run dev:web   # the UI alone in a browser (viewer only), handy for phone-width layouts
```

## Layout

| Path | What |
|---|---|
| `packages/core` | Platform-independent TypeScript: share codes, locale resolution, the `Platform` port. |
| `packages/ui` | The React interface, shared by every shell. Talks to the host only through `Platform`. |
| `apps/desktop` | Electron shell for Windows. |
| `native/audiocap` | C++ WASAPI process-loopback helper (see its README). |

The UI never depends on Electron directly, so a mobile shell (Capacitor) can reuse `core` and `ui` as they are.

## License

GPLv3 — see [LICENSE](LICENSE).
