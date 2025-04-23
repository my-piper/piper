import { queues } from "app/queues";
import { streams } from "app/streams";
import { BASE_URL } from "consts/core";
import { DEFAULT_LANGUAGE } from "core-kit/consts/locale";
import { notify } from "core-kit/services/io";
import { createLogger } from "core-kit/services/logger";
import { Job } from "core-kit/services/queue";
import redis from "core-kit/services/redis";
import sentry from "core-kit/services/sentry";
import { FatalError, TimeoutError } from "core-kit/types/errors";
import { getLabel } from "core-kit/utils/i18n";
import { mapTo } from "core-kit/utils/models";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  NODE_STATUS,
  PIPELINE_ERRORS,
} from "../../consts/redis";
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
    notify(
      launch._id,
      event,
      mapTo(
        {
          launch: launch._id,
          node,
          event,
        },
        PipelineEvent
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
