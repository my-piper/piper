import env from "core-kit/env";
import { readInstance } from "core-kit/packages/redis/utils";
import { toPlain } from "core-kit/packages/transform";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import launchRequestSchema from "schemas/launch-request.json";
import { describe, expect, it, vi } from "vitest";

const { redis } = vi.hoisted(() => ({ redis: { get: vi.fn() } }));

vi.mock("core-kit/packages/redis/redis", () => ({ default: redis }));

describe("backend test harness", () => {
  it("loads isolated configuration before application imports", () => {
    expect(env).toBe(process.env);
    expect(env.NODE_ENV).toBe("test");
    expect(env.ENV).toBe("test");
    expect(env.TZ).toBe("UTC");
    expect(new Date("2026-01-01T00:00:00Z").getTimezoneOffset()).toBe(0);
    expect(env.MONGO_URL).toBeUndefined();
    expect(env.REDIS_PASSWORD).toBeUndefined();
    expect(env.S3_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("supports baseUrl and JSON imports", () => {
    expect(launchRequestSchema.required).toEqual(["nodes", "inputs"]);
  });

  it("runs real model transformations with an explicit Redis double", async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({ launch: 42, node: 7, unexpected: "discard me" })
    );

    const job = await readInstance("test:job", ProcessNodeJob);

    expect(redis.get).toHaveBeenCalledExactlyOnceWith("test:job");
    expect(job).toBeInstanceOf(ProcessNodeJob);
    expect(toPlain(job)).toEqual({ launch: "42", node: "7" });
  });
});
