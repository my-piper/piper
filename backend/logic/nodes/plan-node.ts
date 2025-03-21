import { queues } from "app/queue";
import { JobsOptions } from "core-kit/services/queue";
import { NodeExecution } from "enums/node-execution";
import { Node } from "models/node";

export async function plan(
  id: string,
  { execution }: Node,
  launch: string,
  options: JobsOptions = {}
): Promise<void> {
  await (() => {
    switch (execution) {
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
  })().plan({ launch, node: id }, options);
}
