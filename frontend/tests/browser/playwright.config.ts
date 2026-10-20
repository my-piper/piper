import { defineConfig, devices } from "@playwright/test";

/**
 * Browser workflows against the localized build (`dist-browser`) served by an
 * in-worker fixture server with a stateful API fixture and a real Socket.IO
 * peer. Frontend integration coverage only — not a full-stack test.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../../test-results",
  // One worker owns the fixture server; tests stay isolated per context.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env["CI"],
  timeout: 60_000,
  globalTimeout: 15 * 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env["CI"]
    ? [
        ["list"],
        ["html", { outputFolder: "../../playwright-report", open: "never" }],
      ]
    : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
});
