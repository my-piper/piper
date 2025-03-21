import { createLogger } from "core-kit/services/logger";
import { Job } from "core-kit/services/queue";
import sentry from "core-kit/services/sentry";
import { FatalError, TimeoutError } from "core-kit/types/errors";
import { toPlain } from "core-kit/utils/models";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import io from "../../app/io";
import { queues } from "../../app/queue";
import { BASE_URL } from "../../consts/core";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  NODE_STATUS,
  PIPELINE_ERRORS,
} from "../../consts/redis";
import { redis } from "../../core-kit/services/redis/redis";
import { PipelineEvent } from "../../models/events";
import { Launch } from "../../models/launch";
import { NodeStatus } from "../../models/node";
import { PipelineEventType } from "../../types/pipeline";
import { readInstance, saveInstance } from "../../utils/redis";

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
};
