import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest configuration for the Focus Read Suite (the unified plugin).
 *
 * - Tests run against happy-dom (lightweight DOM).
 * - The `obsidian` module is aliased to the suite's test stub so the plugin
 *   can be imported and exercised outside the real Obsidian application.
 */
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["focus-read-suite/test/**/*.test.ts"],
    globals: false,
    // Timers are faked explicitly inside tests that need it.
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "focus-read-suite/test/helpers/obsidian-stub.ts"),
    },
  },
});
