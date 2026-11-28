import { toInstance } from "core-kit/packages/transform";
import { secondsInDay } from "date-fns";
import { Pipeline, PipelineOutput } from "models/pipeline";
import { LaunchLiveState } from "packages/launches/live-state/live-state";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  NODE_INPUT,
  PIPELINE_OUTPUT,
} from "packages/launches/live-state/keys";
import { MemoryStore } from "packages/launches/live-state/memory-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXECUTION_TIME, launchFixture } from "../../fixtures/launch";

let store: MemoryStore;
let state: LaunchLiveState;
let launch: ReturnType<typeof launchFixture>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  store = new MemoryStore();
  state = new LaunchLiveState(store);
  launch = launchFixture();
});

const json = '{"answer":42}';

function twoOutputs() {
  launch.pipeline.outputs.set(
    "summary",
    toInstance(
      {
        type: "string",
        flows: { summary_flow: { from: "sink_node", output: "summary" } },
      },
      PipelineOutput
    )
  );
}

describe("the Launch live state", () => {
  it("stores a new launch with its inputs and queues it in its scope", async () => {
    await state.create(launch, [
      { node: "echo_node", input: "enabled", value: false },
      { node: "echo_node", input: "count", value: 0 },
    ]);

    expect((await state.get(launch._id))._id).toBe(launch._id);
    expect(
      await state.inputs(
        launch._id,
        "echo_node",
        launch.pipeline.nodes.get("echo_node").inputs
      )
    ).toEqual({ enabled: false, count: 0 });
    await state.beat(launch._id);
    expect(await state.scopeQueue("scope-test", 10)).toEqual({
      waiting: 1,
      live: [launch._id],
    });
  });

  it("expires every key of a launch after LAUNCH_EXPIRED", async () => {
    await state.create(launch, [
      { node: "echo_node", input: "enabled", value: true },
    ]);
    await state.nodeCompleted(launch, "echo_node", {
      outputs: { result: json },
      processed: true,
      pipelineOutputs: { result: json },
    });
    await state.nodeFailed(launch._id, "sink_node", "broken", {
      outcome: "exhausted",
    });

    expect(LAUNCH_EXPIRED).toBe(secondsInDay * 7);
    expect(store.ttl(LAUNCH(launch._id))).toBe(LAUNCH_EXPIRED);
    expect(store.ttl(NODE_INPUT(launch._id, "echo_node", "enabled"))).toBe(
      LAUNCH_EXPIRED
    );
    vi.advanceTimersByTime(LAUNCH_EXPIRED * 1000);
    expect(store.keys()).toEqual(["scope-test"]);
  });

  it("keeps the expiry of a launch that starts later", async () => {
    await state.create(launch, []);
    vi.advanceTimersByTime(60_000);
    launch.startedAt = new Date();

    await state.started(launch);

    expect((await state.get(launch._id)).startedAt).toEqual(launch.startedAt);
    expect(store.ttl(LAUNCH(launch._id))).toBe(LAUNCH_EXPIRED - 60);
  });

  it("reports a missing launch", async () => {
    expect(await state.get("missing")).toBeNull();
    expect(await state.exists("missing")).toBe(false);
  });

  it("records when a launch was interrupted", async () => {
    expect(await state.interruptedAt(launch._id)).toBeNull();

    await state.interrupt(launch._id);

    expect(await state.interruptedAt(launch._id)).toEqual(EXECUTION_TIME);
  });

  it("drops dead launches from a scope and keeps the live ones in order", async () => {
    for (const id of ["first", "dead", "second"]) {
      await state.create(Object.assign(launchFixture(), { _id: id }), []);
    }
    await state.beat("first");
    await state.beat("second");

    const queue = await state.scopeQueue("scope-test", 5);

    expect(queue).toEqual({ waiting: 3, live: ["first", "second"] });
    expect(await state.scopeQueue("scope-test", 5)).toEqual({
      waiting: 2,
      live: ["first", "second"],
    });
    vi.advanceTimersByTime(30_000);
    expect(await state.scopeQueue("scope-test", 5)).toEqual({
      waiting: 2,
      live: [],
    });
    expect(await state.scopeQueue("scope-test", 5)).toEqual({
      waiting: 0,
      live: [],
    });
  });

  describe("a node", () => {
    it("is locked while it runs and released when it stops", async () => {
      await state.nodeStarted(launch._id, "echo_node");

      expect(await state.isProcessing(launch._id, "echo_node")).toBe(true);
      expect(await state.status(launch._id, "echo_node")).toEqual({
        state: "running",
      });
      await state.nodeStopped(launch._id, "echo_node");
      expect(await state.isProcessing(launch._id, "echo_node")).toBe(false);
    });

    it("releases a processing lock left by a dead worker", async () => {
      await state.nodeStarted(launch._id, "echo_node");

      vi.advanceTimersByTime(20_000);

      expect(await state.isProcessing(launch._id, "echo_node")).toBe(false);
    });

    it("keeps its state and progress when it repeats", async () => {
      await state.nodeRepeats(launch._id, "echo_node", "job-1", {
        dueAt: 1234,
        state: { page: 2 },
        progress: { total: 10, processed: 2 },
      });

      expect(await state.state(launch._id, "echo_node")).toEqual({ page: 2 });
      expect(await state.progress(launch._id, "echo_node")).toEqual({
        total: 10,
        processed: 2,
      });
      expect(await state.dueAt(launch._id, "echo_node", "job-1")).toBe(1234);
    });

    it("fills downstream inputs and flows and reruns the next node", async () => {
      await state.nodeCompleted(launch, "sink_node", { processed: true });
      await state.nodeRepeats(launch._id, "sink_node", "job-1", {
        dueAt: 1,
        state: { page: 2 },
      });

      await state.nodeCompleted(launch, "echo_node", {
        outputs: { result: json },
        processed: true,
        inputs: [{ node: "sink_node", input: "value", value: json }],
        flows: [{ node: "sink_node", flow: "result_flow" }],
        rerun: ["sink_node"],
      });

      expect(await state.nodeOutputs(launch._id, "echo_node")).toEqual({
        result: json,
      });
      expect(await state.isProcessed(launch._id, "echo_node")).toBe(true);
      expect(await state.status(launch._id, "echo_node")).toEqual({
        state: "done",
      });
      expect(
        await state.inputs(
          launch._id,
          "sink_node",
          launch.pipeline.nodes.get("sink_node").inputs
        )
      ).toEqual({ value: json });
      expect(
        await state.isFlowDone(launch._id, "sink_node", "result_flow")
      ).toBe(true);
      expect(await state.isProcessed(launch._id, "sink_node")).toBe(false);
      expect(await state.status(launch._id, "sink_node")).toBeNull();
      expect(await state.state(launch._id, "sink_node")).toBeNull();
    });

    it("clears its own inputs that the result resets", async () => {
      await state.create(launch, [
        { node: "echo_node", input: "enabled", value: true },
      ]);

      await state.nodeCompleted(launch, "echo_node", {
        processed: false,
        resetInputs: ["enabled"],
      });

      expect(
        await state.inputs(
          launch._id,
          "echo_node",
          launch.pipeline.nodes.get("echo_node").inputs
        )
      ).toEqual({});
      expect(await state.isProcessed(launch._id, "echo_node")).toBe(false);
    });
  });

  describe("finishing", () => {
    it("finishes the launch when its node fills the last output", async () => {
      const { finished } = await state.nodeCompleted(launch, "echo_node", {
        processed: true,
        pipelineOutputs: { result: json },
      });

      expect(finished).toBe(true);
      expect(await state.isFinished(launch)).toBe(true);
      expect(await state.outputs(launch)).toEqual(new Map([["result", json]]));
    });

    it("does not finish a completion that gives no pipeline output", async () => {
      await state.nodeCompleted(launch, "echo_node", {
        processed: true,
        pipelineOutputs: { result: json },
      });

      const { finished } = await state.nodeCompleted(launch, "sink_node", {
        processed: true,
      });

      expect(finished).toBe(false);
    });

    it("counts an output once however many flows feed it", async () => {
      launch.pipeline.outputs = toInstance(
        {
          outputs: {
            result: {
              type: "json",
              flows: {
                result_flow: { from: "echo_node", output: "result" },
                late_flow: { from: "sink_node", output: "result" },
              },
            },
            summary: {
              type: "string",
              flows: { summary_flow: { from: "sink_node", output: "summary" } },
            },
          },
        },
        Pipeline
      ).outputs;

      const { finished } = await state.nodeCompleted(launch, "echo_node", {
        processed: true,
        pipelineOutputs: { result: json },
      });

      expect(finished).toBe(false);
      expect(await state.isFinished(launch)).toBe(false);
    });

    it("finishes when an output without flows stays empty", async () => {
      launch.pipeline.outputs.set(
        "unused",
        toInstance({ type: "string" }, PipelineOutput)
      );

      const { finished } = await state.nodeCompleted(launch, "echo_node", {
        processed: true,
        pipelineOutputs: { result: json },
      });

      expect(finished).toBe(true);
    });

    it("sees the outputs other nodes gave before", async () => {
      twoOutputs();
      await state.nodeCompleted(launch, "sink_node", {
        processed: true,
        pipelineOutputs: { summary: "done" },
      });

      const { finished } = await state.nodeCompleted(launch, "echo_node", {
        processed: true,
        pipelineOutputs: { result: json },
      });

      expect(finished).toBe(true);
      expect(await state.output(launch, "summary")).toBe("done");
      expect(await state.output(launch, "missing")).toBeUndefined();
      expect(await state.isFinished(launch)).toBe(true);
    });

    it("writes a completion in one batch", async () => {
      const exec = vi.spyOn(store, "exec");

      await state.nodeCompleted(launch, "echo_node", {
        outputs: { result: json },
        processed: true,
        inputs: [{ node: "sink_node", input: "value", value: json }],
        flows: [{ node: "sink_node", flow: "result_flow" }],
        rerun: ["sink_node"],
        pipelineOutputs: { result: json },
      });

      expect(exec).toHaveBeenCalledOnce();
      expect(await state.isFinished(launch)).toBe(true);
      expect(await state.output(launch, "result")).toBe(json);
      expect(store.keys()).toContain(PIPELINE_OUTPUT(launch._id, "result"));
    });
  });

  describe("a failure", () => {
    it.each([
      { outcome: "exhausted" as const, errors: ["earlier", "broken"] },
      { outcome: "fatal" as const, errors: ["broken", "earlier"] },
    ])(
      "records the $outcome error once in the launch",
      async ({ outcome, errors }) => {
        await state.nodeFailed(launch._id, "sink_node", "earlier", {
          outcome: "exhausted",
        });

        await state.nodeFailed(launch._id, "echo_node", "broken", {
          outcome,
        });

        expect(await state.errors(launch._id)).toEqual(errors);
        expect(await state.status(launch._id, "echo_node")).toEqual({
          state: "error",
          error: "broken",
        });
      }
    );

    it("keeps a retried node out of the launch errors", async () => {
      await state.nodeFailed(launch._id, "echo_node", "flaky", {
        outcome: "retry",
        job: "job-1",
        dueAt: 1234,
      });

      expect(await state.errors(launch._id)).toEqual([]);
      expect(await state.dueAt(launch._id, "echo_node", "job-1")).toBe(1234);
      expect(await state.status(launch._id, "echo_node")).toEqual({
        state: "error",
        error: "flaky",
      });
    });
  });

  describe("node logs", () => {
    it("keeps the newest 1000 lines and counts the dropped ones", async () => {
      const lines = (from: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({ message: from + i }));
      await state.appendLogs(launch._id, "echo_node", lines(0, 999));

      await state.appendLogs(launch._id, "echo_node", lines(999, 4));

      const logs = await state.logs(launch._id, "echo_node");
      expect(logs.lines).toHaveLength(1000);
      expect(logs.lines[0]).toEqual({ message: 3 });
      expect(logs.dropped).toBe(3);
    });

    it("has no lines for a node that logged nothing", async () => {
      expect(await state.logs(launch._id, "echo_node")).toEqual({
        lines: [],
        dropped: 0,
      });
    });
  });

  describe("run records", () => {
    it("adds invocations to one open execution until it is closed", async () => {
      await state.addInvocation(launch._id, "echo_node", {
        startedAt: new Date(1000),
        finishedAt: 1500,
        waitMs: 100,
        durationMs: 500,
        attempt: 0,
      });
      await state.addInvocation(launch._id, "echo_node", {
        startedAt: new Date(3000),
        finishedAt: 3200,
        waitMs: 900,
        durationMs: 200,
        attempt: 1,
      });

      const open = await state.closeExecution(launch._id, "echo_node");

      expect(open).toEqual({
        startedAt: 1000,
        finishedAt: 3200,
        waitMs: 100,
        activeMs: 700,
        invocations: 2,
        attempts: 2,
      });
      expect(await state.closeExecution(launch._id, "echo_node")).toBeNull();
    });

    it("lets only the first outcome record the launch run", async () => {
      expect(await state.markRunRecorded(launch._id, "done")).toBe(true);
      expect(await state.markRunRecorded(launch._id, "error")).toBe(false);
    });
  });
});
