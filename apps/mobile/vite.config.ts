import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the shared UI with PlatformMobile into dist/, which Capacitor
// copies into the Android project (npm run sync).
export default defineConfig({
  root: fileURLToPath(new URL("./src", import.meta.url)),
  base: "./",
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
  },
});
