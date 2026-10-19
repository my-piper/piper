import dotenv from "dotenv";
import net from "node:net";
import tls from "node:tls";
import { describe, expect, it } from "vitest";
import { NETWORK_BLOCKED_MESSAGE } from "../helpers/network";

describe("fast test isolation", () => {
  it("rejects .env loading", () => {
    expect(() => dotenv.config()).toThrow(
      "Fast tests must not load .env files"
    );
  });

  it("rejects TCP connections", () => {
    expect(() => net.connect(6379, "127.0.0.1")).toThrow(
      NETWORK_BLOCKED_MESSAGE
    );
  });

  it("rejects TLS connections", () => {
    expect(() => tls.connect(443, "example.com")).toThrow(
      NETWORK_BLOCKED_MESSAGE
    );
  });

  it("rejects fetch requests", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow(
      NETWORK_BLOCKED_MESSAGE
    );
  });

  it.each([
    ["MongoDB", () => import("app/mongo")],
    ["Redis", () => import("core-kit/packages/redis")],
    ["queues", () => import("app/queues")],
  ])("requires an explicit factory for %s", async (_name, loadModule) => {
    await expect(loadModule()).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining("Provide an explicit vi.mock factory"),
      }),
    });
  });
});
