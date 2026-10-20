import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME, launchFixture } from "../../fixtures/launch";
import type { Job } from "core-kit/packages/queue";
import { PipelineCosts } from "models/pipeline";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/string", () => ({ sid: () => "fixed-launch" }));
vi.mock("ulid", () => ({ ulid: () => "fixed-cursor" }));

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  vi.stubEnv("UNIT_COST", "2");
  vi.resetModules();
});

describe("execution billing modes", () => {
  it("calculates launch costs only when billing is active", async () => {
    vi.stubEnv("BILLING_ACTIVE", "yes");
    const { run } = await import("packages/launches/launching");
    const launch = launchFixture();
    launch.pipeline.script = "function costs() { return 3; }";
    doubles.execute.mockResolvedValue({ result: 3, logs: [] });

    const result = await run(launch);

    expect(result.costs.total).toBe(6);
    expect(doubles.execute).toHaveBeenCalledOnce();
    expect(doubles.plans.run).toHaveBeenCalledOnce();
  });

  it("records node usage with BILLING_ACTIVE=yes", async () => {
    vi.stubEnv("BILLING_ACTIVE", "yes");
    const { default: handler } = await import(
      "jobs/process-node/process-node-handler"
    );
    const context = nodeExecutionFixture();
    doubles.execute.mockResolvedValue({
      result: { __type: "next", costs: 3 },
      logs: [],
    });

    await handler(context.nodeJob, context.job as unknown as Job);

    expect(doubles.plans.usage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        launch: context.launch._id,
        node: "Echo",
        costs: 6,
        processedAt: EXECUTION_TIME,
      })
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not record node usage with BILLING_ACTIVE=no", async () => {
    vi.stubEnv("BILLING_ACTIVE", "no");
    const { default: handler } = await import(
      "jobs/process-node/process-node-handler"
    );
    const context = nodeExecutionFixture();
    doubles.execute.mockResolvedValue({
      result: { __type: "next", costs: 3 },
      logs: [],
    });

    await handler(context.nodeJob, context.job as unknown as Job);

    expect(doubles.plans.usage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("records a pipeline estimate once when its outputs are completed", async () => {
    vi.stubEnv("BILLING_ACTIVE", "yes");
    const { default: handler } = await import(
      "jobs/process-node/process-node-handler"
    );
    const context = nodeExecutionFixture();
    context.launch.costs = new PipelineCosts({ pipeline: 4 });

    await handler(context.nodeJob, context.job as unknown as Job);

    expect(doubles.plans.usage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        launch: context.launch._id,
        costs: 4,
        project: "Test project",
        pipeline: "Contract pipeline",
        launchedBy: "user-test",
      })
    );
  });
});
