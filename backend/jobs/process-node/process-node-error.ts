import { queues } from "app/queues";
import { streams } from "app/streams";
import { BASE_URL } from "consts/core";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  NODE_STATUS,
  PIPELINE_ERRORS,
} from "consts/redis";
import { getLabel } from "core-kit/packages/i18n";
import { notify } from "core-kit/packages/io";
import { DEFAULT_LANGUAGE } from "core-kit/packages/locale";
import { createLogger } from "core-kit/packages/logger";
import { Job } from "core-kit/packages/queue";
import redis, { readInstance, saveInstance } from "core-kit/packages/redis";
import sentry from "core-kit/packages/sentry";
import { mapTo } from "core-kit/packages/transform";
import {
  FatalError,
  MemoryLimitError,
  TimeoutError,
} from "core-kit/types/errors";
import { PipelineEvent } from "models/events";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { Launch } from "models/launch";
import { NodeStatus } from "models/node";
import { PipelineEventType } from "types/pipeline";

export default async (nodeJob: ProcessNodeJob, err: Error, job: Job) => {
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
    notify(
      launch._id,
      event,
      mapTo({ launch: launch._id, node }, PipelineEvent)
    );
  };

  await saveInstance(
    NODE_STATUS(launch._id, nodeJob.node),
    new NodeStatus({
      state: "error",
      error: `${err.message}`,
    }),
    LAUNCH_EXPIRED
  );
  notifyNode(nodeJob.node, "node_error");

  const {
    attemptsMade,
    opts: { attempts: maxAttempts },
  } = job;

  logger.error(`Error for attempt ${attemptsMade} from ${maxAttempts}`);

  const { project } = launch;
  const node = launch.pipeline.nodes.get(nodeJob.node);

  await streams.pipeline.errors.send({
    occurredAt: new Date(),
    launch: launch._id,
    project: project._id,
    projectTitle: getLabel(project.title, DEFAULT_LANGUAGE),
    node: nodeJob.node,
    nodeTitle: getLabel(node.title, DEFAULT_LANGUAGE),
    attempt: attemptsMade,
    maxAttempts,
    message: err.message,
  });

  if (attemptsMade >= maxAttempts) {
    logger.error("Save error for launch");
    const key = PIPELINE_ERRORS(launch._id);
    await redis.rPush(key, err.message);
    await redis.expire(key, LAUNCH_EXPIRED);

    queues.launches.errors.set.plan({ launch: launch._id });
  }

  if (
    err instanceof FatalError ||
    err instanceof TimeoutError ||
    err instanceof MemoryLimitError
  ) {
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
};
