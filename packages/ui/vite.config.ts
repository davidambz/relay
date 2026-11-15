/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone browser build of the UI (viewer only, via PlatformWeb). Used
// for dev and to check the layout at phone widths; the desktop app has
// its own Vite config that mounts this same UI with PlatformDesktop.
export default defineConfig({
  plugins: [react()],
  base: "./",
  test: {
    name: "ui",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
