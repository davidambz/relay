import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Production-only CSP. Dev needs inline scripts (React refresh preamble)
// and the Vite websocket, so the policy is injected at build time only.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' blob: mediastream:",
  // PeerJS signaling (wss) and STUN/TURN config fetches, from stage 2 on.
  "connect-src 'self' https: wss:",
].join("; ");

function productionCsp(): Plugin {
  return {
    name: "relay-production-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL("./src/renderer", import.meta.url)),
  base: "./",
  plugins: [react(), productionCsp()],
  build: {
    outDir: fileURLToPath(new URL("./dist-renderer", import.meta.url)),
    emptyOutDir: true,
  },
});
