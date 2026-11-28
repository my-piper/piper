import {
  jobDoubles,
  liveState,
  resetJobDoubles,
  runJob,
} from "../../helpers/job-boundaries";
import { launchFixture } from "../../fixtures/launch";
import { streams } from "app/streams";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const INTERRUPTED_AT = new Date("2026-01-02T03:04:30.000Z");

const sent = vi.hoisted(() => ({ launches: vi.fn(), executions: vi.fn() }));

let launch: ReturnType<typeof launchFixture>;

beforeAll(async () => {
  Object.assign(streams.pipeline, {
    runs: {
      launches: { send: sent.launches },
      executions: { send: sent.executions },
    },
  });
  await import("jobs/record-launch-interrupted");
});

beforeEach(async () => {
  resetJobDoubles();
  sent.launches.mockReset();
  sent.executions.mockReset();
  launch = launchFixture();
  launch.startedAt = new Date("2026-01-02T03:04:10.000Z");
  await liveState.create(launch, []);
});

describe("record launch interrupted job", () => {
  it("closes each open node execution and the launch run at the interrupt time", async () => {
    await liveState.addInvocation(launch._id, "echo_node", {
      startedAt: new Date("2026-01-02T03:04:20.000Z"),
      finishedAt: INTERRUPTED_AT.getTime() - 5000,
      waitMs: 0,
      durationMs: 1000,
      attempt: 0,
    });
    await liveState.interrupt(launch._id, INTERRUPTED_AT);

    await runJob("record_launch_interrupted", { launch: launch._id });

    expect(sent.executions).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        node: "echo_node",
        result: "interrupted",
        finishedAt: INTERRUPTED_AT,
        durationMs: 10_000,
      })
    );
    expect(sent.launches).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        launch: launch._id,
        status: "interrupted",
        finishedAt: INTERRUPTED_AT,
        durationMs: 20_000,
      })
    );
  });

  it("keeps an outcome recorded before the interrupt", async () => {
    await liveState.markRunRecorded(launch._id, "done");
    await liveState.interrupt(launch._id, INTERRUPTED_AT);

    await runJob("record_launch_interrupted", { launch: launch._id });

    expect(sent.launches).not.toHaveBeenCalled();
    expect(sent.executions).not.toHaveBeenCalled();
  });

  it("records nothing for a launch that is not interrupted", async () => {
    await runJob("record_launch_interrupted", { launch: launch._id });

    expect(sent.launches).not.toHaveBeenCalled();
    expect(jobDoubles.notify).not.toHaveBeenCalled();
  });
});
