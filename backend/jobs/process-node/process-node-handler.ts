import {
  LAUNCH,
  LAUNCH_EXPIRED,
  LAUNCH_HEARTBEAT,
  LAUNCH_HEARTBEAT_EXPIRED,
  LAUNCH_INTERRUPTED,
  NODE_FLOWS,
  NODE_JOB_DUE,
  NODE_JOBS,
  NODE_LOGS,
  NODE_PROCESSED_LOCK,
  NODE_PROCESSING_LOCK,
  NODE_PROCESSING_TIMEOUT,
  NODE_PROGRESS,
  NODE_STATE,
  NODE_STATUS,
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
import secondsToMilliseconds from "date-fns/fp/secondsToMilliseconds";
import { NodeExecution } from "enums/node-execution";
import { HeartbeatEvent, PipelineEvent } from "models/events";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { Launch } from "models/launch";
import { NodeLog, NodeStatus } from "models/node";
import {
  execute,
  ExecutionError,
  ExecutionResult,
  LogEntry,
} from "packages/deno";
import { NodeJobResult, RepeatNode } from "types/node";
import { PipelineEventType } from "types/pipeline";
import { checkInputs, convertInputs, getNodeInputs } from "utils/node";
import { getEnvironment } from "./environment";
import { completeNode } from "./complete-node";
import { getErrorResult, recordLaunchRun, recordNodeRun } from "./run-metrics";

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

  const notifyUser = <T extends object | null>(
    type: PipelineEventType,
    event: T = null
  ) => {
    logger.info(`Notify ${type}`);
    if (launch.options?.notify) {
      notify(launch.launchedBy._id, type, event);
    }
  };

  const notifyNode = (node: string, event: PipelineEventType) => {
    if (launch.options?.notify) {
      logger.info(`Notify ${event}`);
      notify(
        launch._id,
        event,
        mapTo({ launch: launch._id, node }, PipelineEvent)
      );
    }
  };

  const notifyPipeline = <T extends object | null>(
    type: PipelineEventType,
    event: T = null
  ) => {
    logger.info(`Notify ${type}`);
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
    const interrupted = await readInstance(LAUNCH(nodeJob.launch), Launch);
    if (!!interrupted) {
      const interruptedAt = await redis.get(LAUNCH_INTERRUPTED(nodeJob.launch));
      await recordLaunchRun(
        interrupted,
        "interrupted",
        !!interruptedAt ? new Date(interruptedAt) : new Date()
      );
    }
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
  let heartbeatActive = true;
  let processingLocked = false;
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
    if (heartbeatActive) {
      timers.heartbeat = setTimeout(async () => {
        await heartbeat();
      }, HEARTBEAT_INTERVAL);
    }
  };
  let [results, logs]: [ExecutionResult, LogEntry[]] = [null, null];
  const DUE = NODE_JOB_DUE(launch._id, nodeJob.node, job.id);
  let run: Parameters<typeof recordNodeRun>[0] = null;
  let finishedAt: number = null;
  try {
    await heartbeat();

    logger.debug("Set processing lock");
    await lock(PROCESSING_LOCK, NODE_PROCESSING_TIMEOUT);
    processingLocked = true;

    logger.debug("Processing node");
    await saveInstance(
      NODE_STATUS(launch._id, nodeJob.node),
      new NodeStatus({ state: "running" }),
      LAUNCH_EXPIRED
    );
    notifyNode(nodeJob.node, "node_running");

    const environment = await getEnvironment({
      launch,
      launchedBy: launch.launchedBy,
      node,
    });

    const due = await redis.get(DUE);
    run = {
      launch,
      node: nodeJob.node,
      attempt: attemptsMade,
      startedAt: new Date(),
      dueAt: !!due ? Number(due) : job.timestamp + (job.opts.delay ?? 0),
    };

    logger.debug("Run node script");
    results = await execute(
      node.script,
      RUN_FUNCTION_NAME,
      {
        schema: {
          node: toPlain(node),
        },
        inputs: converted,
        state,
        env: toPlain(environment),
      },
      {
        timeout: getTimeout(node.execution),
        isolation: node.sign ? "none" : "process",
      }
    );
    finishedAt = Date.now();
    logs = results.logs;
  } catch (e) {
    finishedAt ??= Date.now();
    logger.error(e);
    logger.error("Error while processing");

    const error = e instanceof ExecutionError ? e.typed() : e;
    if (e instanceof ExecutionError) {
      logs = e.logs;
    }

    if (!!run) {
      await recordNodeRun(run, getErrorResult(error), finishedAt);
    }

    throw error;
  } finally {
    logger.debug("Clear heartbeat timer");
    heartbeatActive = false;
    clearTimeout(timers.heartbeat);

    if (processingLocked) {
      logger.debug("Release processing lock");
      await unlock(PROCESSING_LOCK);
    }

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

    await recordNodeRun(run, "repeat", finishedAt);

    const repeatAt = Date.now() + (delay || 1000);
    await redis.setEx(DUE, LAUNCH_EXPIRED, String(repeatAt));
    await job.moveToDelayed(repeatAt);
    throw new DelayedError();
  } else if (result?.["__type"] === "next") {
    await recordNodeRun(run, "done", finishedAt);
    return completeNode({
      launch,
      nodeJob,
      result: result as object,
      logger,
      notifyNode,
      notifyPipeline,
      notifyUser,
    });
  } else {
    await recordNodeRun(run, "error", finishedAt);
    throw new Error(`Wrong handler results ${JSON.stringify(results)}`);
  }
};
