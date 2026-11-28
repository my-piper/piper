import {
  jobDoubles,
  liveState,
  resetJobDoubles,
  runJob,
} from "../../helpers/job-boundaries";
import { EXECUTION_TIME, launchFixture } from "../../fixtures/launch";
import { toInstance } from "core-kit/packages/transform";
import { NodeOutput } from "models/node";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let launch: ReturnType<typeof launchFixture>;
let outputs: object | null;

beforeAll(async () => {
  await import("jobs/save-launch-artefacts");
});

beforeEach(() => {
  resetJobDoubles();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EXECUTION_TIME);
  launch = launchFixture();
  outputs = { result: '{\n  "enabled": false\n}' };
});

// stores the launch as the test changed it, with the node's outputs, then
// runs the job
async function run(queue: string, payload: object) {
  await liveState.create(launch, []);
  if (outputs) {
    await liveState.nodeCompleted(launch, "echo_node", {
      outputs: outputs as Record<string, string>,
      processed: true,
    });
  }
  return runJob(queue, payload);
}

describe("save launch artefacts job", () => {
  it("records one artefact per produced node output", async () => {
    await run("save_node_artefacts", {
      launch: launch._id,
      node: "echo_node",
    });

    expect(
      jobDoubles.mongo.launchArtefacts.insertOne
    ).toHaveBeenCalledExactlyOnceWith({
      _id: "fixed-artefact",
      project: "project-test",
      launch: launch._id,
      node: "echo_node",
      filledAt: EXECUTION_TIME,
      launchedBy: { _id: "user-test" },
      type: "json",
      title: "Result",
      data: { value: { enabled: false } },
      cursor: "fixed-cursor",
    });
  });

  it("skips outputs the node did not produce", async () => {
    outputs = {};

    await run("save_node_artefacts", {
      launch: launch._id,
      node: "echo_node",
    });

    expect(jobDoubles.mongo.launchArtefacts.insertOne).not.toHaveBeenCalled();
  });

  it("reports an output that cannot be converted and saves the others", async () => {
    const failure = new Error("download failed");
    const node = launch.pipeline.nodes.get("echo_node");
    node.outputs = new Map([
      ["picture", toInstance({ type: "image", title: "Picture" }, NodeOutput)],
      ...node.outputs,
    ]);
    outputs = { picture: "https://example.com/a.png", result: "[]" };
    jobDoubles.download.mockRejectedValue(failure);

    await run("save_node_artefacts", {
      launch: launch._id,
      node: "echo_node",
    });

    expect(jobDoubles.download).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/a.png"
    );
    expect(jobDoubles.captureException).toHaveBeenCalledExactlyOnceWith(
      failure
    );
    expect(
      jobDoubles.mongo.launchArtefacts.insertOne
    ).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: "Result", data: { value: [] } })
    );
  });

  it("does nothing when the node has no stored outputs", async () => {
    outputs = null;

    await run("save_node_artefacts", {
      launch: launch._id,
      node: "echo_node",
    });

    expect(jobDoubles.mongo.launchArtefacts.insertOne).not.toHaveBeenCalled();
  });

  it("ignores a launch that is no longer in Redis", async () => {
    await run("save_node_artefacts", {
      launch: "missing-launch",
      node: "echo_node",
    });

    expect(jobDoubles.mongo.launchArtefacts.insertOne).not.toHaveBeenCalled();
  });
});
