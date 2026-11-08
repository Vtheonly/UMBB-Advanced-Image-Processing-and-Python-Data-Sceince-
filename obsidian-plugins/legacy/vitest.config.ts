import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest configuration for the ARCHIVED legacy plugins (regression
 * reference only — run via `npm run test:legacy`).
 */
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["*/test/**/*.test.ts", "shared/test/**/*.test.ts"],
    globals: false,
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "shared/test/obsidian-stub.ts"),
    },
  },
});
