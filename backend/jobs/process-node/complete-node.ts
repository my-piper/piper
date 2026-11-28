import { queues } from "app/queues";
import { streams } from "app/streams";
import type { Logger } from "core-kit/packages/logger";
import { mapTo, toInstance } from "core-kit/packages/transform";
import { differenceInSeconds } from "date-fns";
import get from "lodash/get";
import { PipelineEvent } from "models/events";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { Launch } from "models/launch";
import { InputValue, liveState } from "packages/launches/live-state";
import { plan } from "packages/nodes/plan-node";
import { NextNode, NodeJobResult } from "types/node";
import { PipelineEventType } from "types/pipeline";
import { Primitive } from "types/primitive";
import { convertOutputs } from "utils/node";
import { recordLaunchRun } from "./run-metrics";

type PipelineNotifier = (event: PipelineEventType, payload?: object) => void;

type CompletionContext = {
  launch: Launch;
  nodeJob: ProcessNodeJob;
  result: object;
  logger: Logger;
  notifyNode: (node: string, event: PipelineEventType) => void;
  notifyPipeline: PipelineNotifier;
  notifyUser: PipelineNotifier;
};

export async function completeNode({
  launch,
  nodeJob,
  result,
  logger,
  notifyNode,
  notifyPipeline,
  notifyUser,
}: CompletionContext): Promise<NodeJobResult> {
  const { pipeline, launchRequest } = launch;
  const node = pipeline.nodes.get(nodeJob.node);

  const { outputs, kicks, behavior, reset, delay } = toInstance(
    result as object,
    NextNode
  );

  logger.debug(`Node behavior is ${behavior}`);

  let converted: { [key: string]: Primitive } = {};
  if (outputs) {
    converted = await convertOutputs({
      launch,
      node: nodeJob.node,
      bucket: launchRequest.options?.bucket,
    })(outputs, node.outputs);
    logger.debug("Converted outputs");
  }

  // what its Flows carry downstream
  const inputs: InputValue[] = [];
  const flows: { node: string; flow: string }[] = [];
  const related = new Set<string>();
  if (pipeline.flows) {
    for (const [id, flow] of pipeline.flows) {
      if (flow.from === nodeJob.node) {
        const value = converted[flow.output];
        if (value !== undefined) {
          related.add(flow.to);
          logger.debug(
            `Flow ${flow.from}.${flow.output} > ${flow.to}.${flow.input}`
          );
          const [output, input] = [
            pipeline.nodes.get(flow.from).outputs.get(flow.output),
            pipeline.nodes.get(flow.to).inputs.get(flow.input),
          ];

          const setNodeInputValue = async (value: Primitive) => {
            inputs.push({ node: flow.to, input: flow.input, value });
          };

          switch (flow.transformer?.type) {
            case "json": {
              const { path } = flow.transformer;
              if (path) {
                let json: object = null;

                try {
                  json = JSON.parse(value as string) as object;
                } catch (e) {
                  logger.error(e);
                  break;
                }

                const fromPath = get(json, path);
                if (fromPath !== undefined) {
                  switch (input.type) {
                    case "boolean":
                      await setNodeInputValue(Boolean(fromPath));
                      break;
                    case "integer":
                      if (typeof fromPath === "number") {
                        await setNodeInputValue(fromPath);
                      } else if (typeof fromPath === "string") {
                        await setNodeInputValue(parseInt(fromPath));
                      }
                      break;
                    case "float":
                      if (typeof fromPath === "number") {
                        await setNodeInputValue(fromPath);
                      } else if (typeof fromPath === "string") {
                        await setNodeInputValue(parseFloat(fromPath));
                      }
                      break;
                    case "string":
                      if (typeof fromPath === "string") {
                        await setNodeInputValue(fromPath);
                      } else if (typeof fromPath === "number") {
                        await setNodeInputValue(fromPath.toString());
                      }
                      break;
                    case "json":
                      if (typeof fromPath === "object") {
                        await setNodeInputValue(JSON.stringify(fromPath));
                      }
                      break;
                  }
                }
              }
              break;
            }
            case "array": {
              switch (output.type) {
                case "image[]":
                  switch (input.type) {
                    case "image": {
                      const {
                        transformer: { index },
                      } = flow;
                      const array = (value as string).split("|");
                      const element =
                        array[Math.min(array.length - 1, index)] || null;
                      await setNodeInputValue(element);
                      break;
                    }
                  }
                  break;
              }
              break;
            }
            default: {
              await setNodeInputValue(value);
            }
          }
        }

        // mark for next node flow is done
        flows.push({ node: flow.to, flow: id });
      }
    }
  }

  // the pipeline outputs it gives, by each Flow into them
  const given: { key: string; value: Primitive }[] = [];
  for (const [key, output] of pipeline.outputs ?? []) {
    for (const [, flow] of output.flows ?? []) {
      if (flow.from === nodeJob.node) {
        const value = converted[flow.output];
        if (value !== undefined) {
          given.push({ key, value });
        }
      }
    }
  }

  const { finished } = await liveState.nodeCompleted(launch, nodeJob.node, {
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
    await queues.launches.artefacts.save.plan({
      launch: launch._id,
      node: nodeJob.node,
    });
  }
  if (reset) {
    logger.debug("Reset inputs for node");
    notifyNode(nodeJob.node, "node_reset");
  }
  notifyNode(nodeJob.node, "node_done");

  for (const node of related) {
    notifyNode(node, "node_flow");
    logger.debug(`Plan next node ${node}`);
    await plan(node, pipeline.nodes.get(node), launch._id, { delay });
  }

  if (kicks) {
    for (const kick of kicks) {
      await plan(kick, pipeline.nodes.get(kick), launch._id, { delay });
    }
  }

  const { launchedAt } = launch;
  const processedAt = new Date();

  for (const { key } of given) {
    logger.info(`Set pipeline output [${key}]`);
    notifyPipeline("set_pipeline_output");

    queues.launches.outputs.set.plan({
      launch: launch._id,
      output: key,
    });

    streams.pipeline.metrics.outputs.send({
      launch: launch._id,
      output: key,
      filledAt: processedAt,
      fromStart: differenceInSeconds(processedAt, launchedAt),
    });
  }

  if (finished) {
    const { scope } = launch;
    if (scope) {
      logger.info(`Remove launch from scope ${scope.id}`);
      await liveState.leaveScope(scope.id, launch._id);
    }

    streams.pipeline.metrics.finished.send({
      launch: launch._id,
      finishedAt: processedAt,
      fromStart: differenceInSeconds(processedAt, launchedAt),
    });
    await recordLaunchRun(launch, "done", processedAt);

    notifyUser("pipeline_done", mapTo({ launch: launch._id }, PipelineEvent));
  }

  return NodeJobResult.NODE_PROCESSED;
}
