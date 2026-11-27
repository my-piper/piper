import { NodeState } from "src/models/node";

/**
 * A node's state as the canvas sees it: its backend status, or a local
 * `queued` (a flow delivered a value, its job has not started yet) or
 * `waiting` (its job ran but not every input has arrived).
 */
export type NodeRunState = NodeState | "queued" | "waiting";

export type LaunchState = "running" | "failed" | "done" | "idle";

export interface LaunchGraph {
  /** Node ids of the pipeline. */
  nodes: string[];
  /** Node-to-node flows; pipeline input flows never start a node. */
  flows: { from: string; to: string }[];
  /** The nodes the launch starts at: `inclusive` nodes or `start.nodes`. */
  start: string[];
}

/**
 * The launch state for the canvas pill.
 *
 * Only the main workflow counts: the nodes reachable from the start nodes
 * through flows, plus any node that ran anyway (a script's `next()` can kick
 * a node no flow leads to). A counted node is finished when it is `done`, or
 * when it never got a value although everything upstream of it finished (a
 * skipped branch). Nodes outside the workflow that never ran are ignored.
 *
 * This is not the backend's `pipeline_done`, which fires once every pipeline
 * output is filled: the pill keeps showing Running while a node after the
 * outputs still runs.
 */
export function launchState(
  graph: LaunchGraph,
  states: Record<string, NodeRunState>,
): LaunchState | null {
  const known = new Set(graph.nodes);
  const stateOf = (id: string) => (known.has(id) ? states[id] : undefined);
  const ran = graph.nodes.filter((id) => stateOf(id) !== undefined);
  if (ran.length <= 0) {
    return null;
  }
  if (ran.some((id) => ["running", "queued"].includes(stateOf(id)!))) {
    return "running";
  }

  const counted = reachable(graph);
  ran.forEach((id) => counted.add(id));
  if ([...counted].some((id) => stateOf(id) === "error")) {
    return "failed";
  }

  return finished(graph, counted, stateOf).size === counted.size
    ? "done"
    : "idle";
}

function reachable({ nodes, flows, start }: LaunchGraph) {
  const known = new Set(nodes);
  const seen = new Set(start.filter((id) => known.has(id)));
  const queue = [...seen];
  while (queue.length > 0) {
    const from = queue.shift();
    for (const flow of flows) {
      if (flow.from === from && known.has(flow.to) && !seen.has(flow.to)) {
        seen.add(flow.to);
        queue.push(flow.to);
      }
    }
  }
  return seen;
}

/**
 * Greatest fixpoint, so a skipped branch that loops back on itself still
 * counts as finished: assume every node without a state is skipped, then drop
 * the ones with an unfinished node upstream until nothing changes.
 */
function finished(
  { flows, start }: LaunchGraph,
  counted: Set<string>,
  stateOf: (id: string) => NodeRunState | undefined,
) {
  const starts = new Set(start);
  const result = new Set(
    [...counted].filter((id) => {
      const state = stateOf(id);
      return state === "done" || (state === undefined && !starts.has(id));
    }),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of result) {
      if (stateOf(id) !== undefined) {
        continue;
      }
      const blocked = flows.some(
        (flow) =>
          flow.to === id && counted.has(flow.from) && !result.has(flow.from),
      );
      if (blocked) {
        result.delete(id);
        changed = true;
      }
    }
  }
  return result;
}
