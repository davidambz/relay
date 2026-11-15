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
  // PeerJS signaling. http:/ws: too, for a self-hosted server without TLS
  // (session.server.secure = false, e.g. on a LAN).
  "connect-src 'self' https: wss: http: ws:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
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
    // Never inline scripts as data: URLs (the audio worklet is small
    // enough to be): the CSP only allows script-src 'self'.
    assetsInlineLimit: (file) => (file.endsWith(".js") ? false : undefined),
  },
});
