import { queues } from "app/queues";
import { JobsOptions } from "core-kit/packages/queue";
import { NodeExecution } from "enums/node-execution";
import { Node } from "models/node";
import { isDeployNode } from "./deploy-node";

/**
 * The queue a Node's jobs go to. A deploy node only starts and polls its
 * child, so it always goes to the rapid one, whatever its execution says.
 */
export function processQueue(node: Node) {
  if (isDeployNode(node)) {
    return queues.nodes.process.rapid;
  }
  switch (node.execution) {
    case NodeExecution.rapid:
      return queues.nodes.process.rapid;
    case NodeExecution.deferred:
      return queues.nodes.process.deferred;
    case NodeExecution.protracted:
      return queues.nodes.process.protracted;
    case NodeExecution.regular:
    default:
      return queues.nodes.process.regular;
  }
}

export async function plan(
  id: string,
  node: Node,
  launch: string,
  options: JobsOptions = {}
): Promise<void> {
  await processQueue(node).plan({ launch, node: id }, options);
}
