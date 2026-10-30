import { queues } from "app/queues";
import { streams } from "app/streams";
import { BILLING_ACTIVE, UNIT_COST } from "consts/billing";
import {
  LAUNCH_EXPIRED,
  NODE_FLOWS,
  NODE_INPUT,
  NODE_OUTPUTS,
  NODE_PROCESSED_LOCK,
  NODE_PROGRESS,
  NODE_STATE,
  NODE_STATUS,
  PIPELINE_OUTPUT,
} from "consts/redis";
import type { Logger } from "core-kit/packages/logger";
import redis, { lock, saveInstance, unlock } from "core-kit/packages/redis";
import { mapTo, toInstance } from "core-kit/packages/transform";
import { differenceInSeconds } from "date-fns";
import get from "lodash/get";
import { PipelineEvent } from "models/events";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { Launch } from "models/launch";
import { NodeStatus } from "models/node";
import { plan } from "packages/nodes/plan-node";
import { NextNode, NodeJobResult } from "types/node";
import { PipelineEventType } from "types/pipeline";
import { Primitive } from "types/primitive";
import { convertOutputs } from "utils/node";
import { toRedisValue } from "utils/redis";
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
  const PROCESSED_LOCK = NODE_PROCESSED_LOCK(nodeJob.launch, nodeJob.node);

  const { outputs, kicks, behavior, reset, delay, costs } = toInstance(
    result as object,
    NextNode
  );

  logger.debug(`Node behavior is ${behavior}`);

  let converted: { [key: string]: Primitive } = {};
  if (!!outputs) {
    converted = await convertOutputs({
      launch,
      node: nodeJob.node,
      bucket: launchRequest.options?.bucket,
    })(outputs, node.outputs);
    logger.debug("Converted outputs");

    await redis.setEx(
      NODE_OUTPUTS(launch._id, nodeJob.node),
      LAUNCH_EXPIRED,
      JSON.stringify(converted)
    );

    if (!!launchRequest.options?.bucket) {
      await queues.launches.artefacts.save.plan({
        launch: launch._id,
        node: nodeJob.node,
      });
    }
  }

  if (behavior === "normal") {
    logger.debug("Set processed lock");
    await lock(PROCESSED_LOCK, LAUNCH_EXPIRED);
  }

  if (!!reset) {
    const { inputs } = reset;
    logger.debug("Reset inputs for node");
    for (const i of inputs) {
      await redis.del(NODE_INPUT(launch._id, nodeJob.node, i));
    }
    notifyNode(nodeJob.node, "node_reset");
  }

  await saveInstance(
    NODE_STATUS(launch._id, nodeJob.node),
    mapTo({ state: "done" }, NodeStatus),
    LAUNCH_EXPIRED
  );
  notifyNode(nodeJob.node, "node_done");

  const related = new Set<string>();
  if (!!pipeline.flows) {
    for (const [id, flow] of pipeline.flows) {
      if (flow.from === nodeJob.node) {
        let value = converted[flow.output];
        if (value !== undefined) {
          related.add(flow.to);
          logger.debug(
            `Flow ${flow.from}.${flow.output} > ${flow.to}.${flow.input}`
          );
          const [output, input] = [
            pipeline.nodes.get(flow.from).outputs.get(flow.output),
            pipeline.nodes.get(flow.to).inputs.get(flow.input),
          ];

          const setNodeInputValue = async (value: Primitive) =>
            redis.setEx(
              NODE_INPUT(launch._id, flow.to, flow.input),
              LAUNCH_EXPIRED,
              toRedisValue(input.type, value)
            );

          switch (flow.transformer?.type) {
            case "json": {
              const { path } = flow.transformer;
              if (!!path) {
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
                    case "image":
                      const {
                        transformer: { index },
                      } = flow;
                      const array = (value as string).split("|");
                      const element =
                        array[Math.min(array.length - 1, index)] || null;
                      await setNodeInputValue(element);
                      break;
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
        {
          const key = NODE_FLOWS(launch._id, flow.to);
          await redis.sAdd(key, id);
          await redis.expire(key, LAUNCH_EXPIRED);
        }
      }
    }
    for (const node of related) {
      notifyNode(node, "node_flow");
      await redis.del(NODE_STATUS(launch._id, node));
      await redis.del(NODE_STATE(launch._id, node));
      await redis.del(NODE_PROGRESS(launch._id, node));
      await unlock(NODE_PROCESSED_LOCK(launch._id, node));

      logger.debug(`Plan next node ${node}`);
      await plan(node, pipeline.nodes.get(node), launch._id, { delay });
    }
  }

  if (!!kicks) {
    for (const kick of kicks) {
      await plan(kick, pipeline.nodes.get(kick), launch._id, { delay });
    }
  }

  const { launchedAt } = launch;
  const processedAt = new Date();

  if (!!pipeline.outputs) {
    let total = 0,
      filled = 0;
    for (const [key, output] of pipeline.outputs) {
      if (!!output.flows) {
        for (const [, flow] of output.flows) {
          if (flow.from === nodeJob.node) {
            const value = converted[flow.output];
            if (value !== undefined) {
              logger.info(`Set pipeline output [${key}]`);

              await redis.setEx(
                PIPELINE_OUTPUT(launch._id, key),
                LAUNCH_EXPIRED,
                toRedisValue(output.type, value)
              );
              notifyPipeline("set_pipeline_output");

              queues.launches.outputs.set.plan({
                launch: launch._id,
                output: key,
              });

              const fromStart = differenceInSeconds(processedAt, launchedAt);

              streams.pipeline.metrics.outputs.send({
                launch: launch._id,
                output: key,
                filledAt: processedAt,
                fromStart,
              });

              filled++;
            }
          }
        }
      }
      total++;
    }

    if (filled > 0) {
      for (const [key, output] of pipeline.outputs) {
        if (!!output.flows) {
          for (const [, flow] of output.flows) {
            if (flow.from !== nodeJob.node) {
              const value = await redis.get(PIPELINE_OUTPUT(launch._id, key));
              if (value !== null) {
                filled++;
              }
            }
          }
        }
      }
      logger.info(`Filled ${filled} from ${total} in pipeline outputs`);
      if (filled >= total) {
        const { scope, launchedBy } = launch;
        if (!!scope) {
          logger.info(`Remove launch from scope ${scope.id}`);
          await redis.lRem(scope.id, 0, launch._id);
        }

        const fromStart = differenceInSeconds(processedAt, launchedAt);

        streams.pipeline.metrics.finished.send({
          launch: launch._id,
          finishedAt: processedAt,
          fromStart,
        });
        await recordLaunchRun(launch, "done", processedAt);

        notifyUser(
          "pipeline_done",
          mapTo({ launch: launch._id }, PipelineEvent)
        );

        const { costs } = launch;
        if (costs?.pipeline > 0) {
          await queues.pipelines.usage.record.plan({
            project: launch.project.title,
            pipeline: launch.pipeline.name,
            launch: launch._id,
            launchedBy: launchedBy._id,
            processedAt,
            costs: costs.pipeline,
          });
        }
      }
    }
  }

  if (BILLING_ACTIVE && costs > 0) {
    const { launchedBy } = launch;
    await queues.pipelines.usage.record.plan({
      project: launch.project.title,
      pipeline: launch.pipeline.name,
      launch: launch._id,
      launchedBy: launchedBy._id,
      node: node.title,
      processedAt,
      costs: costs * UNIT_COST,
    });
  }

  return NodeJobResult.NODE_PROCESSED;
}
