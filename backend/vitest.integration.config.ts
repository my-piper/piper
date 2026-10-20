import "./tests/node-version.ts";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    pool: "forks",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    clearMocks: true,
    restoreMocks: true,
  },
});
