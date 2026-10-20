import { doubles } from "./execution-boundaries";
import { LAUNCH, NODE_INPUT } from "consts/redis";
import type { Job } from "core-kit/packages/queue";
import { toPlain } from "core-kit/packages/transform";
import handler from "jobs/process-node/process-node-handler";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { vi } from "vitest";
import { launchFixture } from "../fixtures/launch";

export function nodeExecutionFixture() {
  const launch = launchFixture();
  const nodeJob = new ProcessNodeJob({ launch: launch._id, node: "echo_node" });
  const job = {
    id: "job-test",
    attemptsMade: 0,
    opts: { attempts: 3 },
    moveToDelayed: vi.fn(),
    remove: vi.fn(),
  };
  // Read responses only: writes remain spies, rather than an in-memory Redis implementation.
  const responses = new Map<string, string>([
    [NODE_INPUT(launch._id, "echo_node", "enabled"), ""],
    [NODE_INPUT(launch._id, "echo_node", "count"), "0"],
    [NODE_INPUT(launch._id, "echo_node", "text"), ""],
  ]);
  doubles.redis.get.mockImplementation(async (key: string) =>
    key === LAUNCH(launch._id)
      ? JSON.stringify(toPlain(launch))
      : (responses.get(key) ?? null)
  );

  return {
    launch,
    nodeJob,
    job,
    responses,
    run: () => handler(nodeJob, job as unknown as Job),
  };
}
