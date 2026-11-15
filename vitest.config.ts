import { defineConfig } from "vitest/config";

// One test run across the workspace: each package declares its own
// environment (core is plain Node, ui needs jsdom + React plugin).
export default defineConfig({
  test: {
    projects: ["packages/core", "packages/ui"],
  },
});
