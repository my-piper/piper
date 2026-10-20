import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { NodeExecution } from "enums/node-execution";
import { toInstance } from "core-kit/packages/transform";
import { Node } from "models/node";
import { plan } from "packages/nodes/plan-node";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(resetExecutionDoubles);

describe("node queue selection", () => {
  it.each([
    [NodeExecution.rapid, "rapid"],
    [NodeExecution.regular, "regular"],
    [NodeExecution.deferred, "deferred"],
    [NodeExecution.protracted, "protracted"],
    [undefined, "regular"],
    ["unknown", "regular"],
  ])("routes %s execution to %s", async (execution, queue) => {
    const node = toInstance({ execution }, Node);
    const options = { delay: 250, jobId: "planned-job" };

    await plan("echo_node", node, "launch-test", options);

    expect(doubles.plans[queue]).toHaveBeenCalledExactlyOnceWith(
      { node: "echo_node", launch: "launch-test" },
      options
    );
    for (const other of ["rapid", "regular", "deferred", "protracted"].filter(
      (name) => name !== queue
    )) {
      expect(doubles.plans[other]).not.toHaveBeenCalled();
    }
  });

  it("propagates queue failures to the caller", async () => {
    const failure = new Error("queue unavailable");
    doubles.plans.rapid.mockRejectedValue(failure);

    await expect(
      plan("echo_node", toInstance({ execution: "rapid" }, Node), "launch-test")
    ).rejects.toBe(failure);
  });
});
