import { liveState, liveStore } from "../../helpers/live-state";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { launching, logger } = vi.hoisted(() => ({
  launching: { get: vi.fn() },
  logger: { warn: vi.fn() },
}));

vi.mock("packages/launches/launching", () => launching);
vi.mock("core-kit/packages/logger", () => ({ createLogger: () => logger }));

const { appendNodeLogs, readLaunchLogs } = await import(
  "packages/nodes/node-logs"
);
const { launchFixture } = await import("../../fixtures/launch");
const { NODE_LOGS } = await import("packages/launches/live-state/keys");

const stored = (level: string) =>
  JSON.stringify({ level, message: "hello", attempt: 0, ts: 1 });

describe("node logs levels", () => {
  beforeEach(async () => {
    liveStore.clear();
    await liveState.create(
      Object.assign(launchFixture(), { _id: "launch" }),
      []
    );
    launching.get.mockResolvedValue({
      pipeline: { nodes: new Map([["node", {}]]) },
    });
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

    const { lines } = await liveState.logs("launch", "node");
    expect(lines).toEqual([expect.objectContaining({ level: expected })]);
  });

  it.each([
    { level: "log", expected: "info" },
    { level: "warn", expected: "warn" },
  ])("reads a stored $level line as $expected", async ({ level, expected }) => {
    await liveStore.exec([
      {
        op: "rPush",
        key: NODE_LOGS("launch", "node"),
        values: [stored(level)],
      },
    ]);

    const { logs } = await readLaunchLogs("launch");

    expect(logs.map((log) => log.level)).toEqual([expected]);
  });

  it("stores an unknown level as info and warns once", async () => {
    const entry = { ts: 1, message: "hello", level: "trace" } as never;

    await appendNodeLogs("launch", "node", 0, [entry, entry]);

    const { lines } = await liveState.logs("launch", "node");
    expect(lines.map((line: { level: string }) => line.level)).toEqual([
      "info",
      "info",
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
