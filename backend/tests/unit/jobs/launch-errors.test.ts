import {
  jobDoubles,
  resetJobDoubles,
  runJob,
} from "../../helpers/job-boundaries";
import { launchFixture } from "../../fixtures/launch";
import { LAUNCH, PIPELINE_ERRORS } from "consts/redis";
import { toPlain } from "core-kit/packages/transform";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

let launch: ReturnType<typeof launchFixture>;

beforeAll(async () => {
  await import("jobs/set-launch-errors");
});

beforeEach(() => {
  resetJobDoubles();
  launch = launchFixture();
  jobDoubles.redis.get.mockImplementation(async (key: string) =>
    key === LAUNCH(launch._id) ? JSON.stringify(toPlain(launch)) : null
  );
  jobDoubles.redis.lRange.mockImplementation(async (key: string) =>
    key === PIPELINE_ERRORS(launch._id) ? ["first failure", "second"] : []
  );
});

describe("set launch errors job", () => {
  it("copies the Redis error list into the update and notifies the launcher", async () => {
    await runJob("set_launch_errors", { launch: launch._id });

    expect(jobDoubles.redis.lRange).toHaveBeenCalledExactlyOnceWith(
      PIPELINE_ERRORS(launch._id),
      0,
      -1
    );
    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { $set: { errors: ["first failure", "second"] } }
    );
    expect(jobDoubles.notify).toHaveBeenCalledExactlyOnceWith(
      "user-test",
      "set_errors",
      { launch: launch._id, errors: ["first failure", "second"] }
    );
  });

  it("updates the launch document by its id", async () => {
    await runJob("set_launch_errors", { launch: launch._id });

    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledWith(
      { _id: launch._id },
      expect.anything()
    );
  });

  it("stores an empty list when Redis has no errors", async () => {
    jobDoubles.redis.lRange.mockResolvedValue(null);

    await runJob("set_launch_errors", { launch: launch._id });

    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { errors: [] } }
    );
  });

  it("skips notification for a launch without a launcher", async () => {
    launch.launchedBy = undefined;

    await runJob("set_launch_errors", { launch: launch._id });

    expect(jobDoubles.mongo.launches.updateOne).toHaveBeenCalledOnce();
    expect(jobDoubles.notify).not.toHaveBeenCalled();
  });

  it("ignores a launch that is no longer in Redis", async () => {
    await runJob("set_launch_errors", { launch: "missing-launch" });

    expect(jobDoubles.redis.lRange).not.toHaveBeenCalled();
    expect(jobDoubles.mongo.launches.updateOne).not.toHaveBeenCalled();
  });
});
