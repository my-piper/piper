import "reflect-metadata";
import { afterEach, beforeEach, vi } from "vitest";
import { blockNetwork } from "./helpers/network";

vi.hoisted(() => {
  // Keep OS and runner settings, but discard inherited application credentials.
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
  });
});

vi.mock("core-kit/env", () => ({ default: process.env }));
vi.mock("dotenv", () => {
  const config = () => {
    throw new Error("Fast tests must not load .env files");
  };

  return { config, default: { config } };
});

// Factories stop import-time connections. Suites supply only the doubles they use.
vi.mock("app/mongo", () => {
  throw new Error("Provide an explicit vi.mock factory for app/mongo");
});
vi.mock("app/queues", () => {
  throw new Error("Provide an explicit vi.mock factory for app/queues");
});
vi.mock("app/storage", () => {
  throw new Error("Provide an explicit vi.mock factory for app/storage");
});
vi.mock("app/s3", () => {
  throw new Error("Provide an explicit vi.mock factory for app/s3");
});
vi.mock("app/streams", () => {
  throw new Error("Provide an explicit vi.mock factory for app/streams");
});
vi.mock("core-kit/packages/redis", () => {
  throw new Error(
    "Provide an explicit vi.mock factory for core-kit/packages/redis"
  );
});
vi.mock("core-kit/packages/redis/redis", () => {
  throw new Error("Provide an explicit vi.mock factory for the Redis client");
});
vi.mock("core-kit/packages/queue", () => {
  throw new Error(
    "Provide an explicit vi.mock factory for core-kit/packages/queue"
  );
});
vi.mock("core-kit/packages/queue/redis", () => {
  throw new Error(
    "Provide an explicit vi.mock factory for the BullMQ connection"
  );
});

blockNetwork();
beforeEach(blockNetwork);
afterEach(() => {
  vi.useRealTimers();
});
