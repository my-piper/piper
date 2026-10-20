import {
  jobDoubles,
  resetJobDoubles,
  runJob,
} from "../../helpers/job-boundaries";
import { EXECUTION_TIME } from "../../fixtures/launch";
import { mapTo, toPlain } from "core-kit/packages/transform";
import { RecordPipelineUsageJob } from "models/jobs/record-pipeline-usage-job";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

beforeAll(async () => {
  await import("jobs/record-pipeline-usage");
  await import("jobs/update-user-balance");
});

beforeEach(resetJobDoubles);

describe("record pipeline usage job", () => {
  it("streams the usage record and schedules a delayed balance update", async () => {
    // Serialize like JobsQueue.plan so the real wire date format is used.
    const payload = toPlain(
      mapTo(
        {
          project: "project-test",
          pipeline: "pipeline-test",
          launch: "launch-test",
          launchedBy: "user-test",
          node: "Echo",
          processedAt: EXECUTION_TIME,
          costs: 0.5,
        },
        RecordPipelineUsageJob
      )
    );

    await runJob("pipelines_usage", payload);

    expect(jobDoubles.usage).toHaveBeenCalledExactlyOnceWith({
      project: "project-test",
      pipeline: "pipeline-test",
      launch: "launch-test",
      launchedBy: "user-test",
      node: "Echo",
      processedAt: EXECUTION_TIME,
      costs: 0.5,
      cursor: "fixed-cursor",
    });
    expect(
      jobDoubles.plans.get("users_update_balance")
    ).toHaveBeenCalledExactlyOnceWith({ user: "user-test" }, { delay: 5000 });
  });

  it("does not schedule a balance update when streaming fails", async () => {
    const failure = new Error("Kafka unavailable");
    jobDoubles.usage.mockRejectedValue(failure);

    const result = runJob("pipelines_usage", { launchedBy: "user-test" });

    await expect(result).rejects.toBe(failure);
    expect(jobDoubles.plans.get("users_update_balance")).not.toHaveBeenCalled();
  });
});

describe("update user balance job", () => {
  it.each([
    {
      name: "numeric",
      row: { available: 10.5, used: 4, remaining: 6.5 },
      balance: { available: 10.5, used: 4, remaining: 6.5 },
    },
    {
      // ClickHouse quotes 64-bit integers in JSONEachRow output.
      name: "quoted 64-bit",
      row: { available: "12", used: "15", remaining: "-3" },
      balance: { available: 12, used: 15, remaining: -3 },
    },
  ])(
    "stores $name ClickHouse totals on the user and notifies them",
    async ({ row, balance }) => {
      jobDoubles.clickhouse.query.mockResolvedValue({
        json: async () => [row],
      });

      await runJob("users_update_balance", { user: "user-test" });

      expect(jobDoubles.clickhouse.query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          format: "JSONEachRow",
          query_params: { user: "user-test" },
        })
      );
      expect(jobDoubles.mongo.users.updateOne).toHaveBeenCalledExactlyOnceWith(
        { _id: "user-test" },
        { $set: { balance } }
      );
      expect(jobDoubles.notify).toHaveBeenCalledExactlyOnceWith(
        "user-test",
        "user_balance_updated"
      );
    }
  );

  it("leaves the user untouched when ClickHouse fails", async () => {
    const failure = new Error("ClickHouse unavailable");
    jobDoubles.clickhouse.query.mockRejectedValue(failure);

    const result = runJob("users_update_balance", { user: "user-test" });

    await expect(result).rejects.toBe(failure);
    expect(jobDoubles.mongo.users.updateOne).not.toHaveBeenCalled();
    expect(jobDoubles.notify).not.toHaveBeenCalled();
  });
});
