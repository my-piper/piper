import {
  jobDoubles,
  resetJobDoubles,
  runJob,
} from "../../helpers/job-boundaries";
import { launchFixture } from "../../fixtures/launch";
import { LAUNCH } from "consts/redis";
import { toPlain } from "core-kit/packages/transform";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

let launch: ReturnType<typeof launchFixture>;

beforeAll(async () => {
  await import("jobs/set-launch-inputs");
});

beforeEach(() => {
  resetJobDoubles();
  launch = launchFixture();
  jobDoubles.redis.get.mockImplementation(async (key: string) =>
    key === LAUNCH(launch._id) ? JSON.stringify(toPlain(launch)) : null
  );
});

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

    await runJob("set_launch_inputs", { launch: launch._id });

    expect(storedInputs()).toEqual({
      filter: { _id: launch._id },
      inputs: {
        enabled: { type: "boolean", data: { value: true } },
        count: { type: "integer", data: { value: 7 } },
        text: { type: "string", data: { value: "hello" } },
      },
    });
    expect(jobDoubles.notify).toHaveBeenCalledExactlyOnceWith(
      "user-test",
      "set_inputs",
      expect.objectContaining({ launch: launch._id })
    );
  });

  it("falls back to pipeline defaults for inputs missing from the request", async () => {
    launch.launchRequest.inputs = new Map();

    await runJob("set_launch_inputs", { launch: launch._id });

    expect(storedInputs().inputs).toEqual({
      enabled: { type: "boolean", data: { value: true } },
      count: { type: "integer", data: { value: 5 } },
      text: { type: "string", data: { value: "default text" } },
    });
  });

  it("keeps falsy request inputs instead of their defaults", async () => {
    await runJob("set_launch_inputs", { launch: launch._id });

    expect(storedInputs().inputs).toEqual({
      enabled: { type: "boolean", data: { value: false } },
      count: { type: "integer", data: { value: 0 } },
      text: { type: "string", data: { value: "" } },
    });
  });

  it("skips notification for a launch without a launcher", async () => {
    launch.launchedBy = undefined;

    await runJob("set_launch_inputs", { launch: launch._id });

    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledOnce();
    expect(jobDoubles.notify).not.toHaveBeenCalled();
  });

  it("ignores a launch that is no longer in Redis", async () => {
    await runJob("set_launch_inputs", { launch: "missing-launch" });

    expect(jobDoubles.mongo.launches.updateOne).not.toHaveBeenCalled();
    expect(jobDoubles.notify).not.toHaveBeenCalled();
  });
});
