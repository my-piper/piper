import { toInstance } from "core-kit/packages/transform";
import { Pipeline } from "models/pipeline";
import {
  canFinish,
  isFinished,
  requiredOutputs,
} from "packages/launches/finished";
import { describe, expect, it } from "vitest";

function pipeline(outputs: object | undefined) {
  return toInstance({ name: "Outputs", outputs, nodes: {} }, Pipeline);
}

const twoFlows = {
  answer: {
    type: "string",
    flows: {
      first_flow: { from: "first_node", output: "text" },
      second_flow: { from: "second_node", output: "text" },
    },
  },
  summary: {
    type: "string",
    flows: { summary_flow: { from: "third_node", output: "text" } },
  },
};

const withoutFlows = {
  answer: {
    type: "string",
    flows: { answer_flow: { from: "first_node", output: "text" } },
  },
  unused: { type: "string" },
  empty: { type: "string", flows: {} },
};

describe("a finished launch", () => {
  it.each([
    { filled: ["answer"], finished: false },
    { filled: ["summary"], finished: false },
    { filled: ["answer", "summary"], finished: true },
  ])(
    "counts an output fed by two flows once ($filled)",
    ({ filled, finished }) => {
      const subject = pipeline(twoFlows);

      const result = isFinished(subject, new Set(filled));

      expect(result).toBe(finished);
    }
  );

  it("waits only for outputs fed by a flow", () => {
    const subject = pipeline(withoutFlows);

    const required = requiredOutputs(subject);
    const finished = isFinished(subject, new Set(["answer"]));

    expect(required).toEqual(["answer"]);
    expect(finished).toBe(true);
  });

  it.each([
    { outputs: undefined, expected: false },
    { outputs: {}, expected: false },
    { outputs: { unused: { type: "string" } }, expected: false },
    { outputs: withoutFlows, expected: true },
  ])(
    "can finish only with an output fed by a flow ($expected)",
    ({ outputs, expected }) => {
      const subject = pipeline(outputs);

      const result = canFinish(subject);
      const finished = isFinished(subject, new Set(["unused"]));

      expect(result).toBe(expected);
      expect(finished).toBe(false);
    }
  );
});
