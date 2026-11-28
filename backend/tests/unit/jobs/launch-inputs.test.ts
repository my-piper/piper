import {
  jobDoubles,
  liveState,
  resetJobDoubles,
  runJob,
} from "../../helpers/job-boundaries";
import { launchFixture } from "../../fixtures/launch";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

let launch: ReturnType<typeof launchFixture>;

beforeAll(async () => {
  await import("jobs/set-launch-inputs");
});

beforeEach(() => {
  resetJobDoubles();
  launch = launchFixture();
});

// stores the launch as the test changed it, then runs the job
async function run(queue: string, payload: object) {
  await liveState.create(launch, []);
  return runJob(queue, payload);
}

function storedInputs() {
  const [[filter, update]] = jobDoubles.mongo.launches.updateOne.mock.calls;
  return { filter, inputs: update.$set.inputs };
}

describe("set launch inputs job", () => {
  it("stores typed request inputs on the launch and notifies the launcher", async () => {
    launch.launchRequest.inputs = new Map<string, boolean | number | string>([
      ["enabled", true],
      ["count", 7],
      ["text", "hello"],
    ]);

    await run("set_launch_inputs", { launch: launch._id });

    expect(storedInputs()).toEqual({
      filter: { _id: launch._id },
      inputs: {
        enabled: { type: "boolean", data: { value: true } },
        count: { type: "integer", data: { value: 7 } },
        text: { type: "string", data: { value: "hello" } },
      },
    });
    expect(jobDoubles.notify).toHaveBeenCalledExactlyOnceWith(
      "user:user-test",
      "set_inputs",
      expect.objectContaining({ launch: launch._id })
    );
  });

  it("falls back to pipeline defaults for inputs missing from the request", async () => {
    launch.launchRequest.inputs = new Map();

    await run("set_launch_inputs", { launch: launch._id });

    expect(storedInputs().inputs).toEqual({
      enabled: { type: "boolean", data: { value: true } },
      count: { type: "integer", data: { value: 5 } },
      text: { type: "string", data: { value: "default text" } },
    });
  });

  it("keeps falsy request inputs instead of their defaults", async () => {
    await run("set_launch_inputs", { launch: launch._id });

    expect(storedInputs().inputs).toEqual({
      enabled: { type: "boolean", data: { value: false } },
      count: { type: "integer", data: { value: 0 } },
      text: { type: "string", data: { value: "" } },
    });
  });

  it("skips notification for a launch without a launcher", async () => {
    launch.launchedBy = undefined;

    await run("set_launch_inputs", { launch: launch._id });

    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledOnce();
    expect(jobDoubles.notify).not.toHaveBeenCalled();
  });

  it("ignores a launch that is no longer in Redis", async () => {
    await runJob("set_launch_inputs", { launch: "missing-launch" });

    expect(jobDoubles.mongo.launches.updateOne).not.toHaveBeenCalled();
    expect(jobDoubles.notify).not.toHaveBeenCalled();
  });
});
