import { beforeEach, describe, expect, it, vi } from "vitest";

const { redis, exists, launching, logger } = vi.hoisted(() => ({
  redis: {
    rPush: vi.fn(),
    expire: vi.fn(),
    lTrim: vi.fn(),
    incrBy: vi.fn(),
    lRange: vi.fn(),
    get: vi.fn(),
  },
  exists: vi.fn(),
  launching: { get: vi.fn() },
  logger: { warn: vi.fn() },
}));

vi.mock("core-kit/packages/redis", () => ({ default: redis, exists }));
vi.mock("packages/launches/launching", () => launching);
vi.mock("core-kit/packages/logger", () => ({ createLogger: () => logger }));

const { appendNodeLogs, readLaunchLogs } = await import(
  "packages/nodes/node-logs"
);

const stored = (level: string) =>
  JSON.stringify({ level, message: "hello", attempt: 0, ts: 1 });

describe("node logs levels", () => {
  beforeEach(() => {
    redis.rPush.mockResolvedValue(1);
    exists.mockResolvedValue(true);
    launching.get.mockResolvedValue({
      pipeline: { nodes: new Map([["node", {}]]) },
    });
    redis.get.mockResolvedValue(null);
  });

  it.each([
    { level: "log", expected: "info" },
    { level: "debug", expected: "debug" },
    { level: "info", expected: "info" },
    { level: "warn", expected: "warn" },
    { level: "error", expected: "error" },
  ])("stores a $level line as $expected", async ({ level, expected }) => {
    const entry = { ts: 1, message: "hello", level } as never;

    await appendNodeLogs("launch", "node", 0, [entry]);

    const [, [line]] = redis.rPush.mock.calls[0];
    expect(JSON.parse(line).level).toBe(expected);
  });

  it.each([
    { level: "log", expected: "info" },
    { level: "warn", expected: "warn" },
  ])("reads a stored $level line as $expected", async ({ level, expected }) => {
    redis.lRange.mockResolvedValue([stored(level)]);

    const { logs } = await readLaunchLogs("launch");

    expect(logs.map((log) => log.level)).toEqual([expected]);
  });

  it("stores an unknown level as info and warns once", async () => {
    const entry = { ts: 1, message: "hello", level: "trace" } as never;

    await appendNodeLogs("launch", "node", 0, [entry, entry]);

    const [, lines] = redis.rPush.mock.calls[0];
    expect(lines.map((line: string) => JSON.parse(line).level)).toEqual([
      "info",
      "info",
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
