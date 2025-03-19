import { createLogger } from "core-kit/services/logger";
import sentry from "core-kit/services/sentry";
import { FatalError, TimeoutError } from "core-kit/types/errors";
import { toPlain } from "core-kit/utils/models";
import { differenceInSeconds } from "date-fns";
import { pathToFileURL } from "node:url";
import { Module, SourceTextModule } from "node:vm";
import path from "path";
import io from "../app/io";
import { queues } from "../app/queue";
import { streams } from "../app/stream";
import { BASE_URL } from "../consts/core";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  LAUNCH_HEARTBEAT,
  LAUNCH_HEARTBEAT_EXPIRED,
  NODE_FLOWS,
  NODE_INPUT,
  NODE_JOB,
  NODE_OUTPUTS,
  NODE_PROCESSED_LOCK,
  NODE_PROCESSING_LOCK,
  NODE_PROCESSING_TIMEOUT,
  NODE_PROGRESS,
  NODE_STATE,
  NODE_STATUS,
  PIPELINE_ERRORS,
  PIPELINE_OUTPUT,
} from "../consts/redis";
import { redis } from "../core-kit/services/redis/redis";
import { PipelineEvent } from "../models/events";
import { Launch } from "../models/launch";
import { NodeStatus } from "../models/node";
import { NextNode, NodeInputs, NodeJobResult, RepeatNode } from "../types/node";
import { PipelineEventType } from "../types/pipeline";
import {
  checkInputs,
  convertInputs,
  convertOutputs,
  getNodeInputs,
} from "../utils/node";
import {
  lock,
  locked,
  readInstance,
  readObject,
  release,
  saveInstance,
  saveObject,
  toRedisValue,
} from "../utils/redis";
import { createContext } from "./process-node/context";

queues.nodes.process(
  async (nodeJob, job) => {
    await redis.setEx(
      NODE_JOB(nodeJob.launch, nodeJob.node, job.id),
      LAUNCH_EXPIRED,
      new Date().toISOString()
    );

    const logger = createLogger("process-node", {
      launch: nodeJob.launch,
      node: nodeJob.node,
    });

    const notifyNode = (node: string, event: PipelineEventType) => {
      if (launch.options?.notify) {
        logger.info(`Notify ${event}`);
        io.to(launch._id).emit(
          event,
          toPlain(
            new PipelineEvent({
              launch: launch._id,
              node,
              event,
            })
          )
        );
      }
    };

    const notifyPipeline = (event: PipelineEventType) => {
      if (launch.options?.notify) {
        io.to(launch._id).emit(
          event,
          toPlain(
            new PipelineEvent({
              launch: launch._id,
              event,
            })
          )
        );
      }
    };

    const {
      attemptsMade,
      opts: { attempts: maxAttempts },
    } = job;

    logger.debug(
      `Processing job ${job.id} for node ${attemptsMade} / ${maxAttempts}`
    );

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

    await redis.setEx(
      LAUNCH_HEARTBEAT(launch._id),
      LAUNCH_HEARTBEAT_EXPIRED,
      new Date().toISOString()
    );

    const { pipeline } = launch;
    const node = pipeline.nodes.get(nodeJob.node);
    if (!node) {
      logger.error("Node is not found in workflow");
      return NodeJobResult.NODE_NOT_FOUND_IN_WORKFLOW;
    }

    // prepare inputs
    if (!!pipeline.flows) {
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
    //logger.debug('Node inputs', inputs);
    if (!checkInputs(inputs, node.inputs).ready) {
      logger.debug("Node is not ready yet");
      return NodeJobResult.NODE_INPUTS_NOT_READY_YET;
    }

    const converted = convertInputs({ node })(inputs);
    // logger.debug("Converted inputs", converted);
    // logger.debug(JSON.stringify(inputs));

    // node is ready
    const state = await readObject(NODE_STATE(launch._id, nodeJob.node));

    const PROCESSING_LOCK = NODE_PROCESSING_LOCK(nodeJob.launch, nodeJob.node);
    if (await locked(PROCESSING_LOCK)) {
      logger.debug("Node is processing now already");
      return NodeJobResult.NODE_IS_PROCESSING_NOW_ALREADY;
    }

    logger.debug("Set processing lock");
    await lock(PROCESSING_LOCK, NODE_PROCESSING_TIMEOUT);

    logger.debug("Processing node");

    await saveInstance(
      NODE_STATUS(launch._id, nodeJob.node),
      new NodeStatus({ state: "running" })
    );
    notifyNode(nodeJob.node, "node_running");

    logger.debug("Run node script");

    const MODULES_FOLDER = path.join(
      process.cwd(),
      "..",
      "packages",
      "node_modules"
    );
    const script = new SourceTextModule(node.script, {
      context: await createContext({ launch, node, logger }),
      importModuleDynamically: async (specifier: string): Promise<Module> => {
        const modulePath = pathToFileURL(
          path.join(MODULES_FOLDER, specifier)
        ).href;
        return import(modulePath);
      },
    });
    await script.link(() => null);

    let results: RepeatNode | NextNode | null = null;
    try {
      script.evaluate();
      const { run: action } = script.namespace as {
        run: ({
          inputs,
          state,
        }: {
          inputs: NodeInputs;
          state: object | null;
        }) => Promise<NextNode | RepeatNode>;
      };
      if (typeof action !== "function") {
        throw new FatalError("Function `run()` is not implemented");
      }
      results = await action({ inputs: converted, state });
    } catch (e) {
      logger.error(e);
      logger.error("Error while processing");
      throw e;
    } finally {
      logger.debug("Release processing lock");
      await release(PROCESSING_LOCK);
    }

    if (results instanceof RepeatNode) {
      const { delay, progress, state } = results;
      if (!!state) {
        await saveObject(NODE_STATE(launch._id, nodeJob.node), state);
      }

      if (!!progress) {
        logger.debug(progress);
        await saveInstance(NODE_PROGRESS(launch._id, nodeJob.node), progress);
        notifyNode(nodeJob.node, "node_progress");
      }

      logger.debug(
        `Node ${nodeJob.node} is going to repeat with delay ${delay}`
      );
      notifyNode(nodeJob.node, "node_gonna_repeat");

      await queues.nodes.plan(
        {
          launch: launch._id,
          node: nodeJob.node,
        },
        {
          delay: delay || 1000,
        }
      );
      return NodeJobResult.NODE_IS_GOING_TO_REPEAT;
    } else if (results instanceof NextNode) {
      const { outputs, behavior, reset, delay } = results;
      const converted = await convertOutputs({ launch, node: nodeJob.node })(
        outputs,
        node.outputs
      );

      logger.debug("Converted outputs", converted);

      await redis.setEx(
        NODE_OUTPUTS(launch._id, nodeJob.node),
        LAUNCH_EXPIRED,
        JSON.stringify(converted)
      );

      logger.debug(`Node behavior is ${behavior}`);

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
        new NodeStatus({ state: "done" })
      );
      notifyNode(nodeJob.node, "node_done");

      const related = new Set<string>();
      if (!!pipeline.flows) {
        for (const [id, flow] of pipeline.flows) {
          if (flow.from === nodeJob.node) {
            const value = converted[flow.output];
            if (value !== undefined) {
              related.add(flow.to);
              logger.debug(
                `Flow ${flow.from}.${flow.output} > ${flow.to}.${flow.input}`
              );
              const output = pipeline.nodes
                .get(flow.from)
                .outputs.get(flow.output);

              const input = pipeline.nodes.get(flow.to).inputs.get(flow.input);
              await redis.setEx(
                NODE_INPUT(launch._id, flow.to, flow.input),
                LAUNCH_EXPIRED,
                toRedisValue(output.type, value)
              );
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
          await redis.del(NODE_OUTPUTS(launch._id, node));
          await release(NODE_PROCESSED_LOCK(launch._id, node));

          logger.debug(`Plan next node ${node}`);

          await queues.nodes.plan(
            {
              launch: launch._id,
              node,
            },
            { delay: delay || 1000 }
          );
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

                  const fromStart = differenceInSeconds(
                    processedAt,
                    launchedAt
                  );

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
                  const value = await redis.get(
                    PIPELINE_OUTPUT(launch._id, key)
                  );
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
            logger.info(`Remove launch from scope ${scope.id}`);
            await redis.lRem(scope.id, 0, launch._id);

            const fromStart = differenceInSeconds(processedAt, launchedAt);

            streams.pipeline.metrics.finished.send({
              launch: launch._id,
              finishedAt: processedAt,
              fromStart,
            });

            const { pipeline: costs } = launch.costs;
            if (costs > 0) {
              await queues.pipelines.usages.plan({
                project: launch.project.title,
                pipeline: launch.pipeline.name,
                launch: launch._id,
                launchedBy: launchedBy._id,
                processedAt,
                costs,
              });
            }
          }
        }
      }

      const { costs } = results;
      if (costs > 0) {
        const { launchedBy } = launch;
        await queues.pipelines.usages.plan({
          project: launch.project.title,
          pipeline: launch.pipeline.name,
          launch: launch._id,
          launchedBy: launchedBy._id,
          node: node.title,
          processedAt,
          costs,
        });
      }

      return NodeJobResult.NODE_PROCESSED;
    } else {
      throw new Error("Wrong handler results");
    }
  },
  async (nodeJob, err, job) => {
    const logger = createLogger("process-node", {
      launch: nodeJob.launch,
      node: nodeJob.node,
    });

    const launch = await readInstance(LAUNCH(nodeJob.launch), Launch);
    if (!launch) {
      logger.error("Launch is not found");
      return;
    }

    const notifyNode = (node: string, event: PipelineEventType) => {
      io.to(launch._id).emit(
        event,
        toPlain(
          new PipelineEvent({
            launch: launch._id,
            node,
            event,
          })
        )
      );
    };

    await saveInstance(
      NODE_STATUS(launch._id, nodeJob.node),
      new NodeStatus({
        state: "error",
        error: `${err.message}`,
      })
    );
    notifyNode(nodeJob.node, "node_error");

    const {
      attemptsMade,
      opts: { attempts: maxAttempts },
    } = job;

    logger.error(`Error for attempt ${attemptsMade} from ${maxAttempts}`);

    if (attemptsMade >= maxAttempts) {
      logger.error("Save error for launch");
      const key = PIPELINE_ERRORS(launch._id);
      await redis.rPush(key, err.message);
      await redis.expire(key, LAUNCH_EXPIRED);

      queues.launches.errors.set.plan({ launch: launch._id });
    }

    if (err instanceof FatalError || err instanceof TimeoutError) {
      const key = PIPELINE_ERRORS(launch._id);
      await redis.lPush(key, err.message);
      await redis.expire(key, LAUNCH_EXPIRED);
      queues.launches.errors.set.plan({ launch: launch._id });
      try {
        await job.remove();
      } catch (e) {
        logger.error(e);
      }
    } else {
      logger.error(err);
      sentry.captureException(err, {
        extra: {
          launch: launch._id,
          node: nodeJob.node,
          url: `${BASE_URL}/launches/${launch._id}/nodes/${nodeJob.node}`,
        },
      });
    }
  }
);
