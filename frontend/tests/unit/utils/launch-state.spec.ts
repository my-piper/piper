import { LaunchGraph, launchState, nodeProgress } from "src/utils/launch-state";

const flow = (from: string, to: string) => ({ from, to });

/** start → a → b, plus `orphan`, which no flow leads to. */
function chain(): LaunchGraph {
  return {
    nodes: ["start", "a", "b", "orphan"],
    flows: [flow("start", "a"), flow("a", "b")],
    start: ["start"],
  };
}

/** start → router → (left | right) → merge. */
function branches(): LaunchGraph {
  return {
    nodes: ["start", "router", "left", "right", "merge"],
    flows: [
      flow("start", "router"),
      flow("router", "left"),
      flow("router", "right"),
      flow("left", "merge"),
      flow("right", "merge"),
    ],
    start: ["start"],
  };
}

describe("launchState", () => {
  it("is hidden before any node reports a state", () => {
    const graph = chain();

    const state = launchState(graph, {});

    expect(state).toBeNull();
  });

  it("is done when the main workflow is done, ignoring a node outside it", () => {
    const graph = chain();

    const state = launchState(graph, { start: "done", a: "done", b: "done" });

    expect(state).toBe("done");
  });

  it("is idle while a node of the main workflow has not run", () => {
    const graph = chain();

    const state = launchState(graph, { start: "done", a: "waiting" });

    expect(state).toBe("idle");
  });

  it("is idle while a start node has not run", () => {
    const graph = { ...chain(), start: ["start", "orphan"] };

    const state = launchState(graph, { start: "done", a: "done", b: "done" });

    expect(state).toBe("idle");
  });

  it("counts a node outside the workflow once a script kicked it", () => {
    const graph = chain();
    const done = { start: "done", a: "done", b: "done" } as const;

    const states = [
      launchState(graph, { ...done, orphan: "running" }),
      launchState(graph, { ...done, orphan: "error" }),
      launchState(graph, { ...done, orphan: "done" }),
    ];

    expect(states).toEqual(["running", "failed", "done"]);
  });

  it("is running while a node waits in the queue between two nodes", () => {
    const graph = chain();

    const state = launchState(graph, { start: "done", a: "queued" });

    expect(state).toBe("running");
  });

  it("treats a branch that got no value as finished", () => {
    const graph = branches();

    const state = launchState(graph, {
      start: "done",
      router: "done",
      left: "done",
      merge: "done",
    });

    expect(state).toBe("done");
  });

  it("is idle when the node after a skipped branch waits for it", () => {
    const graph = branches();

    const state = launchState(graph, {
      start: "done",
      router: "done",
      left: "done",
      merge: "waiting",
    });

    expect(state).toBe("idle");
  });

  it("starts the main workflow at the inclusive nodes of a partial run", () => {
    const graph = { ...chain(), start: ["b"] };

    const state = launchState(graph, { b: "done" });

    expect(state).toBe("done");
  });

  it("treats a skipped branch that loops back on itself as finished", () => {
    const graph: LaunchGraph = {
      nodes: ["start", "router", "loop", "body", "end"],
      flows: [
        flow("start", "router"),
        flow("router", "loop"),
        flow("router", "end"),
        flow("loop", "body"),
        flow("body", "loop"),
      ],
      start: ["start"],
    };

    const state = launchState(graph, {
      start: "done",
      router: "done",
      end: "done",
    });

    expect(state).toBe("done");
  });

  it("ignores states of nodes the pipeline no longer has", () => {
    const graph = chain();

    const state = launchState(graph, {
      start: "done",
      a: "done",
      b: "done",
      gone: "running",
    });

    expect(state).toBe("done");
  });
});

describe("nodeProgress", () => {
  it("counts done, failed and running nodes over the whole pipeline", () => {
    const nodes = ["a", "b", "c", "d", "e"];
    const states = {
      a: "done",
      b: "error",
      c: "running",
      d: "queued",
      unknown: "done",
    } as const;

    const progress = nodeProgress(nodes, states);

    expect(progress).toEqual({ done: 1, failed: 1, running: 2, total: 5 });
  });
});
