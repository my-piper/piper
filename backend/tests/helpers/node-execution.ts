import "./execution-boundaries";
import { liveState } from "./live-state";
import type { Job } from "core-kit/packages/queue";
import handler from "jobs/process-node/process-node-handler";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import type { InputValue } from "packages/launches/live-state/live-state";
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
  // the echo_node inputs the launch starts with (falsy on purpose)
  const inputs: InputValue[] = [
    { node: "echo_node", input: "enabled", value: false },
    { node: "echo_node", input: "count", value: 0 },
    { node: "echo_node", input: "text", value: "" },
  ];

  // Stores the launch (with `inputs` the first time) as the test changed it.
  const store = async () => {
    if (await liveState.exists(launch._id)) {
      await liveState.started(launch);
    } else {
      await liveState.create(launch, inputs);
    }
  };

  return {
    launch,
    nodeJob,
    job,
    inputs,
    store,
    // runs the node job without storing the launch first
    handle: () => handler(nodeJob, job as unknown as Job),
    run: async () => {
      await store();
      return handler(nodeJob, job as unknown as Job);
    },
  };
}
