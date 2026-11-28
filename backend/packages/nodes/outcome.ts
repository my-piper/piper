import { toInstance, toPlain } from "core-kit/packages/transform";
import {
  ChildLaunchRequest,
  LaunchChildrenNode,
  NextNode,
  RepeatNode,
} from "types/node";

/**
 * What one run of a Node comes to, whatever ran it: a script in Deno or the
 * backend for a deploy node. A script returns it as `{ __type, ... }`;
 * anything it throws, and a result of no known type, is an error.
 */
export type NodeOutcome =
  // start Child Launches, then run again after the delay (ADR 0001)
  | { type: "launch"; launches: ChildLaunchRequest[]; delay?: number }
  // run again after the delay, keeping a state and a progress
  | { type: "repeat"; delay?: number; state?: object; progress?: object }
  // done: give outputs and plan what follows
  | { type: "next"; next: NextNode }
  | { type: "error"; error: Error };

/** The outcome of a run that returned this result and wrote these logs. */
export function toOutcome(result: unknown, logs: unknown[] = []): NodeOutcome {
  switch ((result as { __type?: unknown } | null)?.__type) {
    case "launch": {
      const { launches, delay } = toInstance(
        result as object,
        LaunchChildrenNode
      );
      return { type: "launch", launches, delay };
    }
    case "repeat": {
      const { delay, state, progress } = toInstance(
        result as object,
        RepeatNode
      );
      return {
        type: "repeat",
        delay,
        ...(state ? { state } : {}),
        ...(progress ? { progress: toPlain(progress) } : {}),
      };
    }
    case "next":
      return { type: "next", next: toInstance(result as object, NextNode) };
    default:
      return {
        type: "error",
        error: new Error(
          `Wrong handler results ${JSON.stringify({ result, logs })}`
        ),
      };
  }
}
