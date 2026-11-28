import { queues } from "app/queues";
import { streams } from "app/streams";
import type { Logger } from "core-kit/packages/logger";
import { differenceInSeconds } from "date-fns";
import { Launch } from "models/launch";
import { InputValue, liveState } from "packages/launches/live-state";
import { flowValue } from "packages/nodes/flow-value";
import { plan } from "packages/nodes/plan-node";
import { NextNode } from "types/node";
import { PipelineEventType } from "types/pipeline";
import { Primitive } from "types/primitive";
import { convertOutputs } from "utils/node";

type CompletionContext = {
  launch: Launch;
  node: string;
  logger: Logger;
  notifyNode: (node: string, event: PipelineEventType) => void;
  notifyPipeline: (event: PipelineEventType) => void;
};

/**
 * Applies a Node's `next` result: writes its outputs and what its Flows carry
 * downstream, plans the Nodes that follow and gives pipeline outputs. Says
 * whether this completion finished the Launch; what a finished Launch does is
 * up to the caller.
 */
export async function completeNode(
  { launch, node: id, logger, notifyNode, notifyPipeline }: CompletionContext,
  { outputs, kicks, behavior, reset, delay }: NextNode
): Promise<{ finished: boolean }> {
  const { pipeline, launchRequest } = launch;
  const node = pipeline.nodes.get(id);

  logger.debug(`Node behavior is ${behavior}`);

  let converted: { [key: string]: Primitive } = {};
  if (outputs) {
    converted = await convertOutputs({
      launch,
      node: id,
      bucket: launchRequest.options?.bucket,
    })(outputs, node.outputs);
    logger.debug("Converted outputs");
  }

  // what its Flows carry downstream
  const inputs: InputValue[] = [];
  const flows: { node: string; flow: string }[] = [];
  const related = new Set<string>();
  for (const [flowId, flow] of pipeline.flows ?? []) {
    if (flow.from !== id) {
      continue;
    }
    const value = converted[flow.output];
    if (value !== undefined) {
      related.add(flow.to);
      logger.debug(
        `Flow ${flow.from}.${flow.output} > ${flow.to}.${flow.input}`
      );
      const carried = flowValue(
        flow,
        node.outputs.get(flow.output),
        pipeline.nodes.get(flow.to).inputs.get(flow.input),
        value
      );
      if (carried !== undefined) {
        inputs.push({ node: flow.to, input: flow.input, value: carried });
      }
    }

    // mark for next node flow is done
    flows.push({ node: flow.to, flow: flowId });
  }

  // the pipeline outputs it gives, by each Flow into them
  const given: { key: string; value: Primitive }[] = [];
  for (const [key, output] of pipeline.outputs ?? []) {
    for (const [, flow] of output.flows ?? []) {
      if (flow.from === id) {
        const value = converted[flow.output];
        if (value !== undefined) {
          given.push({ key, value });
        }
      }
    }
  }

  const { finished } = await liveState.nodeCompleted(launch, id, {
    ...(outputs ? { outputs: converted } : {}),
    processed: behavior === "normal",
    resetInputs: reset?.inputs ?? [],
    inputs,
    flows,
    rerun: [...related],
    pipelineOutputs: Object.fromEntries(
      given.map(({ key, value }) => [key, value])
    ),
  });

  if (outputs && launchRequest.options?.bucket) {
    await queues.launches.artefacts.save.plan({ launch: launch._id, node: id });
  }
  if (reset) {
    logger.debug("Reset inputs for node");
    notifyNode(id, "node_reset");
  }
  notifyNode(id, "node_done");

  for (const next of related) {
    notifyNode(next, "node_flow");
    logger.debug(`Plan next node ${next}`);
    await plan(next, pipeline.nodes.get(next), launch._id, { delay });
  }

  for (const kick of kicks ?? []) {
    await plan(kick, pipeline.nodes.get(kick), launch._id, { delay });
  }

  const { launchedAt } = launch;
  const processedAt = new Date();

  for (const { key } of given) {
    logger.info(`Set pipeline output [${key}]`);
    notifyPipeline("set_pipeline_output");

    queues.launches.outputs.set.plan({ launch: launch._id, output: key });

    streams.pipeline.metrics.outputs.send({
      launch: launch._id,
      output: key,
      filledAt: processedAt,
      fromStart: differenceInSeconds(processedAt, launchedAt),
    });
  }

  return { finished };
}
