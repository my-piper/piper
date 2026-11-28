import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, transaction } = vi.hoisted(() => {
  const transaction = {
    set: vi.fn(),
    rPush: vi.fn(),
    exists: vi.fn(),
    exec: vi.fn(),
  };
  const client = {
    get: vi.fn(),
    set: vi.fn(),
    lRem: vi.fn(),
    multi: vi.fn(() => transaction),
  };
  return { client, transaction };
});

vi.mock("core-kit/packages/redis/redis", () => ({ default: client }));

const { redisStore } = await import("packages/launches/live-state/redis-store");

beforeEach(() => {
  client.multi.mockImplementation(() => transaction);
});

describe("the Redis store of the Launch live state", () => {
  it("runs one command directly on the client", async () => {
    client.get.mockResolvedValue("value");

    const replies = await redisStore.exec([{ op: "get", key: "launch:x" }]);

    expect(replies).toEqual(["value"]);
    expect(client.multi).not.toHaveBeenCalled();
  });

  it.each([
    {
      command: { ttl: 60 },
      options: { EX: 60 },
    },
    { command: { keepTtl: true }, options: { KEEPTTL: true } },
    { command: { ttl: 60, nx: true }, options: { EX: 60, NX: true } },
    { command: {}, options: {} },
  ])("maps set options $options", async ({ command, options }) => {
    await redisStore.exec([{ op: "set", key: "k", value: "v", ...command }]);

    expect(client.set).toHaveBeenCalledExactlyOnceWith("k", "v", options);
  });

  it("removes every occurrence of a value from a list", async () => {
    await redisStore.exec([{ op: "lRem", key: "scope", value: "launch" }]);

    expect(client.lRem).toHaveBeenCalledExactlyOnceWith("scope", 0, "launch");
  });

  it("runs a batch as one MULTI transaction and returns its replies", async () => {
    transaction.exec.mockResolvedValue(["OK", 1, 1]);

    const replies = await redisStore.exec([
      { op: "set", key: "a", value: "1", ttl: 5 },
      { op: "rPush", key: "b", values: ["x"] },
      { op: "exists", key: "a" },
    ]);

    expect(replies).toEqual(["OK", 1, 1]);
    expect(client.multi).toHaveBeenCalledOnce();
    expect(transaction.set).toHaveBeenCalledWith("a", "1", { EX: 5 });
    expect(transaction.rPush).toHaveBeenCalledWith("b", ["x"]);
    expect(transaction.exists).toHaveBeenCalledWith("a");
    expect(client.set).not.toHaveBeenCalled();
  });
});
