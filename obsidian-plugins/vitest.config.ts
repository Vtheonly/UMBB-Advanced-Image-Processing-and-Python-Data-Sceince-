import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest configuration for the three Obsidian plugins.
 *
 * - Each plugin's unit tests run against happy-dom (lightweight DOM).
 * - The `obsidian` module is aliased to a test stub so that plugin code can be
 *   imported and exercised outside of the real Obsidian application.
 */
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["*/test/**/*.test.ts", "shared/test/**/*.test.ts"],
    globals: false,
    // Timers are faked explicitly inside tests that need it.
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "shared/test/obsidian-stub.ts"),
    },
  },
});
