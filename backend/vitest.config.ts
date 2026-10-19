import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    pool: "forks",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        "{api,app,consts,enums,jobs,models,packages,transformers,utils}/**/*.ts",
      ],
      exclude: ["**/*.d.ts"],
    },
  },
});
