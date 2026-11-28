import { toPlain } from "core-kit/packages/transform";
import { NodeExecution } from "enums/node-execution";
import { Environment } from "models/environment";
import { Launch } from "models/launch";
import { execute, ExecutionError, LogEntry } from "packages/deno";
import { readChildren } from "packages/launches/child-launches";
import { isDeployNode, runDeployNode } from "packages/nodes/deploy-node";
import { NodeOutcome, toOutcome } from "packages/nodes/outcome";
import { NodeInputs } from "types/node";

const RUN_FUNCTION_NAME = "run";

function getTimeout(execution: NodeExecution): number {
  switch (execution) {
    case NodeExecution.rapid:
      return 3_000;
    case NodeExecution.deferred:
      return 60_000;
    case NodeExecution.protracted:
      return 300_000;
    case NodeExecution.regular:
    default:
      return 20_000;
  }
}

/** A Node's run: its outcome and the log lines its script wrote. */
export type NodeExecutionResult = { outcome: NodeOutcome; logs: LogEntry[] };

type ExecutionContext = {
  launch: Launch;
  node: string;
  inputs: NodeInputs;
  state: object | null;
  environment: Environment;
};

/**
 * Runs a Node once: its script in Deno, or the backend's own logic for a
 * deploy node (ADR 0011). Never throws: whatever fails is an error outcome.
 */
export async function executeNode({
  launch,
  node: id,
  inputs,
  state,
  environment,
}: ExecutionContext): Promise<NodeExecutionResult> {
  const node = launch.pipeline.nodes.get(id);
  try {
    const children = await readChildren(launch._id, id);

    if (isDeployNode(node)) {
      return {
        outcome: toOutcome(await runDeployNode(node, inputs, children)),
        logs: [],
      };
    }

    const { result, logs } = await execute(
      node.script,
      RUN_FUNCTION_NAME,
      {
        schema: {
          node: toPlain(node),
        },
        inputs,
        state,
        env: toPlain(environment),
        ...(children ? { children } : {}),
      },
      {
        timeout: getTimeout(node.execution),
        isolation: node.isolated ? "process" : "none",
      }
    );
    return { outcome: toOutcome(result), logs };
  } catch (e) {
    if (e instanceof ExecutionError) {
      return { outcome: { type: "error", error: e.typed() }, logs: e.logs };
    }
    return { outcome: { type: "error", error: e as Error }, logs: [] };
  }
}
