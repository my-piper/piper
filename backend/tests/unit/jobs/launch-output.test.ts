import {
  jobDoubles,
  liveState,
  liveStore,
  resetJobDoubles,
  runJob,
} from "../../helpers/job-boundaries";
import { EXECUTION_TIME, launchFixture } from "../../fixtures/launch";
import { PIPELINE_OUTPUT } from "packages/launches/live-state/keys";
import { PipelineIOType } from "types/pipeline";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let launch: ReturnType<typeof launchFixture>;
let outputValue: string | null;

beforeAll(async () => {
  await import("jobs/set-launch-output");
});

beforeEach(() => {
  resetJobDoubles();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EXECUTION_TIME);
  launch = launchFixture();
  outputValue = '{"items":[false,0,""]}';
});

// stores the launch as the test changed it, with the output's stored (encoded)
// value, then runs the job
async function run(queue: string, payload: object) {
  await liveState.create(launch, []);
  if (outputValue !== null) {
    await liveStore.exec([
      {
        op: "set",
        key: PIPELINE_OUTPUT(launch._id, "result"),
        value: outputValue,
      },
    ]);
  }
  return runJob(queue, payload);
}

describe("set launch output job", () => {
  it("stores output data, records an artefact, and notifies the launcher", async () => {
    const artefact = {
      _id: "fixed-artefact",
      project: "project-test",
      launch: launch._id,
      filledAt: EXECUTION_TIME,
      launchedBy: { _id: "user-test" },
      type: "json",
      data: { value: { items: [false, 0, ""] } },
      cursor: "fixed-cursor",
    };

    await run("set_launch_output", { launch: launch._id, output: "result" });

    expect(await liveState.outputData(launch)).toEqual(
      new Map([["result", { value: { items: [false, 0, ""] }, type: "json" }]])
    );
    expect(
      jobDoubles.mongo.launchArtefacts.insertOne
    ).toHaveBeenCalledExactlyOnceWith(artefact);
    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledExactlyOnceWith(
      { _id: launch._id },
      [
        {
          $set: {
            outputs: {
              $mergeObjects: [
                "$outputs",
                { result: { $mergeObjects: ["$outputs.result", artefact] } },
              ],
            },
          },
        },
      ]
    );
    expect(jobDoubles.notify).toHaveBeenCalledExactlyOnceWith(
      "user:user-test",
      "set_output",
      expect.objectContaining({ launch: launch._id, id: "result" })
    );
  });

  it.each<{ type: PipelineIOType; encoded: string; data: object }>([
    { type: "boolean", encoded: "", data: { value: false } },
    { type: "integer", encoded: "0", data: { value: 0 } },
    { type: "float", encoded: "-1.25", data: { value: -1.25 } },
    { type: "string", encoded: "", data: { value: "" } },
    { type: "string[]", encoded: "a|b", data: { value: "a, b" } },
  ])(
    "decodes a $type Redis value $encoded before storing it",
    async ({ type, encoded, data }) => {
      launch.pipeline.outputs.get("result").type = type;
      outputValue = encoded;

      await run("set_launch_output", {
        launch: launch._id,
        output: "result",
      });

      expect(jobDoubles.mongo.launchArtefacts.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ type, data })
      );
    }
  );

  it("records an anonymous artefact without notifying", async () => {
    launch.launchedBy = undefined;

    await run("set_launch_output", { launch: launch._id, output: "result" });

    expect(jobDoubles.mongo.launchArtefacts.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ launchedBy: null })
    );
    expect(jobDoubles.notify).not.toHaveBeenCalled();
  });

  it("does nothing when the pipeline output has no value", async () => {
    outputValue = null;

    await run("set_launch_output", { launch: launch._id, output: "result" });

    expect(await liveState.outputData(launch)).toEqual(new Map());
    expect(jobDoubles.mongo.launchArtefacts.insertOne).not.toHaveBeenCalled();
    expect(jobDoubles.mongo.launches.updateOne).not.toHaveBeenCalled();
  });

  it("ignores a launch that is no longer in Redis", async () => {
    await runJob("set_launch_output", {
      launch: "missing-launch",
      output: "result",
    });

    expect(jobDoubles.mongo.launchArtefacts.insertOne).not.toHaveBeenCalled();
  });
});
