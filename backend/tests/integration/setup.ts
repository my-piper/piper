import "reflect-metadata";
import { beforeEach, vi } from "vitest";
import { restrictNetwork } from "./network";

vi.hoisted(() => {
  const settings = {
    mongoUrl: process.env.PIPER_TEST_MONGO_URL,
    database: process.env.PIPER_TEST_MONGO_DATABASE,
    redisPort: process.env.PIPER_TEST_REDIS_PORT,
    denoUrl: process.env.PIPER_TEST_DENO_URL,
  };
  if (
    !/^mongodb:\/\/127\.0\.0\.1:\d+$/.test(settings.mongoUrl || "") ||
    !/^piper_tests_[a-z0-9_]+$/.test(settings.database || "") ||
    !/^\d+$/.test(settings.redisPort || "") ||
    !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(settings.denoUrl || "")
  ) {
    throw new Error(
      "Use npm run test:integration to start disposable services"
    );
  }

  const preservedKeys = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot"];
  for (const key of Object.keys(process.env)) {
    if (!preservedKeys.includes(key) && !key.startsWith("VITEST")) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, {
    NODE_ENV: "test",
    ENV: "test",
    TZ: "UTC",
    LOG_LEVEL: "silent",
    LOG_PRETTY: "",
    MONGO_URL: settings.mongoUrl,
    MONGO_DB: settings.database,
    REDIS_URL: `redis://127.0.0.1:${settings.redisPort}/1`,
    BULL_REDIS_HOST: "127.0.0.1",
    BULL_REDIS_PORT: settings.redisPort,
    BULL_REDIS_DB: "5",
    DENO_URL: settings.denoUrl,
  });
});

vi.mock("core-kit/env", () => ({ default: process.env }));
vi.mock("dotenv", () => {
  const config = () => {
    throw new Error("Integration tests must not load .env files");
  };
  return { config, default: { config } };
});

vi.mock("app/streams", () => ({
  streams: {
    pipeline: {
      metrics: { outputs: { send: vi.fn() }, finished: { send: vi.fn() } },
      errors: { send: vi.fn() },
    },
  },
}));
vi.mock("core-kit/packages/io", () => ({ notify: vi.fn() }));
vi.mock("core-kit/packages/sentry", () => ({
  default: { captureException: vi.fn() },
}));
vi.mock("app/storage", () => {
  const unexpected = () => {
    throw new Error("Object storage is outside this integration suite");
  };
  return { artefact: unexpected, bucket: unexpected, output: unexpected };
});
vi.mock("app/s3", () => {
  throw new Error("S3 is outside this integration suite");
});

// Initialize the real decorator/error cycle before importing application modules.
restrictNetwork();
beforeEach(restrictNetwork);
await import("core-kit/types/errors");
