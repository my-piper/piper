import {
  jobDoubles,
  liveState,
  liveStore,
  resetJobDoubles,
  runJob,
} from "../../helpers/job-boundaries";
import { launchFixture } from "../../fixtures/launch";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let launch: ReturnType<typeof launchFixture>;
let errors: string[];

beforeAll(async () => {
  await import("jobs/set-launch-errors");
});

beforeEach(() => {
  resetJobDoubles();
  launch = launchFixture();
  errors = ["first failure", "second"];
});

// stores the launch as the test changed it, with its errors, then runs the job
async function run(queue: string, payload: object) {
  await liveState.create(launch, []);
  for (const error of errors) {
    await liveState.nodeFailed(launch._id, "echo_node", error, {
      outcome: "exhausted",
    });
  }
  return runJob(queue, payload);
}

describe("set launch errors job", () => {
  it("copies the Redis error list into the update and notifies the launcher", async () => {
    await run("set_launch_errors", { launch: launch._id });

    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { $set: { errors: ["first failure", "second"] } }
    );
    expect(jobDoubles.notify).toHaveBeenCalledExactlyOnceWith(
      "user:user-test",
      "set_errors",
      { launch: launch._id, errors: ["first failure", "second"] }
    );
  });

  it("updates the launch document by its id", async () => {
    await run("set_launch_errors", { launch: launch._id });

    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledWith(
      { _id: launch._id },
      expect.anything()
    );
  });

  it("stores an empty list when Redis has no errors", async () => {
    errors = [];

    await run("set_launch_errors", { launch: launch._id });

    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { errors: [] } }
    );
  });

  it("skips notification for a launch without a launcher", async () => {
    launch.launchedBy = undefined;

    await run("set_launch_errors", { launch: launch._id });

    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledOnce();
    expect(jobDoubles.notify).not.toHaveBeenCalled();
  });

  it("ignores a launch that is no longer in Redis", async () => {
    const read = vi.spyOn(liveStore, "exec");

    await runJob("set_launch_errors", { launch: "missing-launch" });

    expect(read).toHaveBeenCalledOnce();
    expect(jobDoubles.mongo.launches.updateOne).not.toHaveBeenCalled();
  });
});
