import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { Job } from "core-kit/packages/queue";
import { mapTo } from "core-kit/packages/transform";
import secondsToMilliseconds from "date-fns/fp/secondsToMilliseconds";
import { HeartbeatEvent, PipelineEvent } from "models/events";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { liveState } from "packages/launches/live-state";
import { recordInterrupted } from "packages/launches/run-metrics";
import { appendNodeLogs } from "packages/nodes/node-logs";
import { NodeJobResult } from "types/node";
import { PipelineEventType } from "types/pipeline";
import { checkInputs, convertInputs, getNodeInputs } from "utils/node";
import { applyOutcome, NodeRun } from "./apply-outcome";
import { getEnvironment } from "./environment";
import { executeNode, NodeExecutionResult } from "./execute-node";
import { LAUNCH_ROOM, USER_ROOM } from "consts/rooms";

const HEARTBEAT_INTERVAL = secondsToMilliseconds(10);

export default async (nodeJob: ProcessNodeJob, job: Job) => {
  await liveState.addJob(nodeJob.launch, nodeJob.node, job.id);

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
      notify(USER_ROOM(launch.launchedBy._id), type, event);
    }
  };

  const notifyNode = (node: string, event: PipelineEventType) => {
    if (launch.options?.notify) {
      logger.info(`Notify ${event}`);
      notify(
        LAUNCH_ROOM(launch._id),
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
      notify(LAUNCH_ROOM(launch._id), type, event);
    }
  };

  const {
    attemptsMade,
    opts: { attempts: maxAttempts },
  } = job;

  logger.debug(
    `Processing job ${job.id} for node ${attemptsMade} / ${maxAttempts}`
  );

  const interruptedAt = await liveState.interruptedAt(nodeJob.launch);
  if (interruptedAt) {
    logger.debug("Launch has been interrupted");
    const interrupted = await liveState.get(nodeJob.launch);
    if (interrupted) {
      // the interrupt records the Launch; a run that was in flight then has
      // reopened this Node's execution since
      await recordInterrupted(interrupted, interruptedAt, [nodeJob.node]);
    }
    return NodeJobResult.LAUNCH_INTERRUPTED;
  }

  if (await liveState.isProcessed(nodeJob.launch, nodeJob.node)) {
    logger.debug("Node has been processed already before");
    return NodeJobResult.NODE_HAS_BEEN_PROCESSED_ALREADY;
  }

  const launch = await liveState.get(nodeJob.launch);
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
          default: {
            const ready = await liveState.isFlowDone(
              launch._id,
              nodeJob.node,
              id
            );
            logger.debug(`Flow ${id} ${ready ? "ready" : "not ready"}`);

            if (!ready) {
              logger.info(`Flow is not done ${id}`);
              notifyNode(nodeJob.node, "node_not_ready");
              return NodeJobResult.NODE_FLOWS_NOT_READY_YET;
            }
            continue;
          }
        }
      }
    }
  }

  const inputs = await getNodeInputs({ launch, node })(nodeJob.node);
  logger.debug("Node inputs", inputs);
  if (!checkInputs(inputs, node.inputs).ready) {
    logger.debug("Node is not ready yet");
    notifyNode(nodeJob.node, "node_not_ready");
    return NodeJobResult.NODE_INPUTS_NOT_READY_YET;
  }

  const converted = convertInputs({ node })(inputs);
  logger.debug("Converted inputs", converted);
  logger.debug(JSON.stringify(inputs));

  // node is ready
  const state = await liveState.state(launch._id, nodeJob.node);

  if (await liveState.isProcessing(launch._id, nodeJob.node)) {
    logger.debug("Node is processing now already");
    return NodeJobResult.NODE_IS_PROCESSING_NOW_ALREADY;
  }

  const timers: { heartbeat: NodeJS.Timeout } = { heartbeat: null };
  let heartbeatActive = true;
  let processingLocked = false;
  const heartbeat = async () => {
    logger.debug("Launch heartbeat");
    await liveState.beat(launch._id);
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
  let execution: NodeExecutionResult = null;
  let run: NodeRun = null;
  try {
    await heartbeat();

    logger.debug("Set processing lock");
    await liveState.nodeStarted(launch._id, nodeJob.node);
    processingLocked = true;

    logger.debug("Processing node");
    notifyNode(nodeJob.node, "node_running");

    const environment = await getEnvironment({ launch, node });

    const due = await liveState.dueAt(launch._id, nodeJob.node, job.id);
    const startedAt = new Date();
    execution = await executeNode({
      launch,
      node: nodeJob.node,
      inputs: converted,
      state,
      environment,
    });
    run = {
      launch,
      node: nodeJob.node,
      job,
      attempt: attemptsMade,
      startedAt,
      dueAt: due ?? job.timestamp + (job.opts.delay ?? 0),
      finishedAt: Date.now(),
    };
  } catch (e) {
    logger.error(e);
    logger.error("Error while processing");
    throw e;
  } finally {
    logger.debug("Clear heartbeat timer");
    heartbeatActive = false;
    clearTimeout(timers.heartbeat);

    if (processingLocked) {
      logger.debug("Release processing lock");
      await liveState.nodeStopped(launch._id, nodeJob.node);
    }

    if (execution?.logs?.length > 0) {
      await appendNodeLogs(
        launch._id,
        nodeJob.node,
        attemptsMade,
        execution.logs
      );
    }
  }

  return applyOutcome(run, execution.outcome, {
    logger,
    notify: { node: notifyNode, pipeline: notifyPipeline, user: notifyUser },
  });
};
