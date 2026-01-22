import { queues } from "app/queues";
import { streams } from "app/streams";
import { BILLING_ACTIVE, UNIT_COST } from "consts/billing";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  LAUNCH_HEARTBEAT,
  LAUNCH_HEARTBEAT_EXPIRED,
  LAUNCH_INTERRUPTED,
  NODE_FLOWS,
  NODE_INPUT,
  NODE_JOBS,
  NODE_LOGS,
  NODE_OUTPUTS,
  NODE_PROCESSED_LOCK,
  NODE_PROCESSING_LOCK,
  NODE_PROCESSING_TIMEOUT,
  NODE_PROGRESS,
  NODE_STATE,
  NODE_STATUS,
  PIPELINE_OUTPUT,
} from "consts/redis";
import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { DelayedError, Job } from "core-kit/packages/queue";
import redis, {
  exists,
  lock,
  locked,
  readInstance,
  readObject,
  saveInstance,
  saveObject,
  unlock,
} from "core-kit/packages/redis";
import { mapTo, toInstance, toPlain } from "core-kit/packages/transform";
import { differenceInSeconds } from "date-fns";
import secondsToMilliseconds from "date-fns/fp/secondsToMilliseconds";
import { NodeExecution } from "enums/node-execution";
import { HeartbeatEvent, NodeEvent } from "models/events";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { Launch } from "models/launch";
import { NodeLog, NodeStatus } from "models/node";
import {
  execute,
  ExecutionError,
  ExecutionResult,
  LogEntry,
} from "packages/deno";
import { plan } from "packages/nodes/plan-node";
import { NextNode, NodeJobResult, RepeatNode } from "types/node";
import { PipelineEventType } from "types/pipeline";
import { Primitive } from "types/primitive";
import {
  checkInputs,
  convertInputs,
  convertOutputs,
  getNodeInputs,
} from "utils/node";
import { toRedisValue } from "utils/redis";
import { getEnvironment } from "./environment";

const HEARTBEAT_INTERVAL = secondsToMilliseconds(10);
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

export default async (nodeJob: ProcessNodeJob, job: Job) => {
  {
    const key = NODE_JOBS(nodeJob.launch, nodeJob.node);
    await redis.sAdd(key, job.id);
    await redis.expire(key, LAUNCH_EXPIRED);
  }

  const logger = createLogger("process-node", {
    launch: nodeJob.launch,
    node: nodeJob.node,
  });

  const notifyNode = (node: string, event: PipelineEventType) => {
    if (launch.options?.notify) {
      logger.info(`Notify ${event}`);
      notify(launch._id, event, mapTo({ launch: launch._id, node }, NodeEvent));
    }
  };

  const notifyPipeline = <T extends object | null>(
    type: PipelineEventType,
    event: T = null
  ) => {
    if (launch.options?.notify) {
      notify(launch._id, type, event);
    }
  };

  const {
    attemptsMade,
    opts: { attempts: maxAttempts },
  } = job;

  logger.debug(
    `Processing job ${job.id} for node ${attemptsMade} / ${maxAttempts}`
  );

  if (await exists(LAUNCH_INTERRUPTED(nodeJob.launch))) {
    logger.debug("Launch has been interrupted");
    return NodeJobResult.LAUNCH_INTERRUPTED;
  }

  const PROCESSED_LOCK = NODE_PROCESSED_LOCK(nodeJob.launch, nodeJob.node);
  if (await locked(PROCESSED_LOCK)) {
    logger.debug("Node has been processed already before");
    return NodeJobResult.NODE_HAS_BEEN_PROCESSED_ALREADY;
  }

  const launch = await readInstance(LAUNCH(nodeJob.launch), Launch);
  if (!launch) {
    logger.error("Launch is not found");
    return NodeJobResult.LAUNCH_NOT_FOUND;
  }

  const { pipeline, launchRequest } = launch;
  const node = pipeline.nodes.get(nodeJob.node);
  if (!node) {
    logger.error("Node is not found in workflow");
    return NodeJobResult.NODE_NOT_FOUND_IN_WORKFLOW;
  }

  const inclusive = launchRequest.inclusive?.nodes || [];
  if (inclusive.length > 0 && !inclusive.includes(nodeJob.node)) {
    logger.error("Node is not inclusive");
    return NodeJobResult.NODE_IN_NOT_INCLUSIVE;
  }

  // prepare inputs
  if (!inclusive.includes(nodeJob.node)) {
    for (const [id, flow] of pipeline.flows) {
      if (flow.to === nodeJob.node) {
        switch (flow.mode) {
          case "move":
            // go ahead
            continue;
          case "wait":
          default:
            const ready = await redis.sIsMember(
              NODE_FLOWS(launch._id, nodeJob.node),
              id
            );
            logger.debug(`Flow ${id} ${ready ? "ready" : "not ready"}`);

            if (!ready) {
              logger.info(`Flow is not done ${id}`);
              return NodeJobResult.NODE_FLOWS_NOT_READY_YET;
            }
            continue;
        }
      }
    }
  }

  const inputs = await getNodeInputs({ launch, node })(nodeJob.node);
  logger.debug("Node inputs", inputs);
  if (!checkInputs(inputs, node.inputs).ready) {
    logger.debug("Node is not ready yet");
    return NodeJobResult.NODE_INPUTS_NOT_READY_YET;
  }

  const converted = convertInputs({ node })(inputs);
  logger.debug("Converted inputs", converted);
  logger.debug(JSON.stringify(inputs));

  // node is ready
  const state = await readObject(NODE_STATE(launch._id, nodeJob.node));

  const PROCESSING_LOCK = NODE_PROCESSING_LOCK(nodeJob.launch, nodeJob.node);
  if (await locked(PROCESSING_LOCK)) {
    logger.debug("Node is processing now already");
    return NodeJobResult.NODE_IS_PROCESSING_NOW_ALREADY;
  }

  const timers: { heartbeat: NodeJS.Timeout } = { heartbeat: null };
  const heartbeat = async () => {
    logger.debug("Launch heartbeat");
    await redis.setEx(
      LAUNCH_HEARTBEAT(launch._id),
      LAUNCH_HEARTBEAT_EXPIRED,
      new Date().toISOString()
    );
    notifyPipeline(
      "launch_heartbeat",
      mapTo({ launch: launch._id, heartbeat: new Date() }, HeartbeatEvent)
    );
    timers.heartbeat = setTimeout(async () => {
      await heartbeat();
    }, HEARTBEAT_INTERVAL);
  };
  await heartbeat();

  logger.debug("Set processing lock");
  await lock(PROCESSING_LOCK, NODE_PROCESSING_TIMEOUT);

  logger.debug("Processing node");

  await saveInstance(
    NODE_STATUS(launch._id, nodeJob.node),
    new NodeStatus({ state: "running" }),
    LAUNCH_EXPIRED
  );
  notifyNode(nodeJob.node, "node_running");

  logger.debug("Run node script");

  let [results, logs]: [ExecutionResult, LogEntry[]] = [null, null];
  try {
    results = await execute(
      node.script,
      RUN_FUNCTION_NAME,
      {
        schema: {
          node: toPlain(node),
        },
        inputs: converted,
        state,
        env: await (async () => {
          const { launchedBy } = launch;
          const environment = await getEnvironment({
            launch,
            launchedBy,
            node,
          });
          return toPlain(environment);
        })(),
      },
      {
        timeout: getTimeout(node.execution),
        isolation: node.sign ? "none" : "process",
      }
    );
    logs = results.logs;
  } catch (e) {
    logger.error(e);
    logger.error("Error while processing");

    if (e instanceof ExecutionError) {
      logs = e.logs;
      throw e.typed();
    }

    throw e;
  } finally {
    logger.debug("Release processing lock");
    await unlock(PROCESSING_LOCK);

    logger.debug("Clear heartbeat timer");
    clearTimeout(timers.heartbeat);

    if (logs?.length > 0) {
      const key = NODE_LOGS(launch._id, nodeJob.node);
      await redis.rPush(
        key,
        logs.map(({ message, level }) => {
          const plain = toPlain(
            mapTo({ message, level, attempt: attemptsMade }, NodeLog)
          );
          return JSON.stringify(plain);
        })
      );
      await redis.expire(key, LAUNCH_EXPIRED);
    }
  }

  const { result } = results;

  if (result?.["__type"] === "repeat") {
    const { delay, progress, state } = toInstance(result as object, RepeatNode);
    if (!!state) {
      await saveObject(
        NODE_STATE(launch._id, nodeJob.node),
        state,
        LAUNCH_EXPIRED
      );
    }

    if (!!progress) {
      logger.debug(progress);
      await saveInstance(
        NODE_PROGRESS(launch._id, nodeJob.node),
        progress,
        LAUNCH_EXPIRED
      );
      notifyNode(nodeJob.node, "node_progress");
    }

    logger.debug(`Node ${nodeJob.node} is going to repeat with delay ${delay}`);
    notifyNode(nodeJob.node, "node_gonna_repeat");

    await job.moveToDelayed(Date.now() + (delay || 1000));
    throw new DelayedError();
  } else if (result?.["__type"] === "next") {
    const { outputs, kicks, behavior, reset, delay } = toInstance(
      result as object,
      NextNode
    );

    logger.debug(`Node behavior is ${behavior}`);

    let converted: { [key: string]: Primitive } = {};
    if (!!outputs) {
      converted = await convertOutputs({ launch, node: nodeJob.node })(
        outputs,
        node.outputs
      );
      logger.debug("Converted outputs");

      await redis.setEx(
        NODE_OUTPUTS(launch._id, nodeJob.node),
        LAUNCH_EXPIRED,
        JSON.stringify(converted)
      );

      await queues.launches.artefacts.save.plan({
        launch: launch._id,
        node: nodeJob.node,
      });
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
                        setNodeInputValue(element);
                        break;
                    }
                    break;
                }
                break;
              }
              default: {
                setNodeInputValue(value);
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

    if (BILLING_ACTIVE) {
      const { costs } = results;
      if (costs > 0) {
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
    }

    return NodeJobResult.NODE_PROCESSED;
  } else {
    throw new Error(`Wrong handler results ${JSON.stringify(results)}`);
  }
};
