import { queues } from "app/queues";
import { streams } from "app/streams";
import { BASE_URL } from "consts/core";
import { getLabel } from "core-kit/packages/i18n";
import { notify } from "core-kit/packages/io";
import { DEFAULT_LANGUAGE } from "core-kit/packages/locale";
import { createLogger } from "core-kit/packages/logger";
import { Job } from "core-kit/packages/queue";
import sentry from "core-kit/packages/sentry";
import { mapTo } from "core-kit/packages/transform";
import {
  FatalError,
  MemoryLimitError,
  TimeoutError,
} from "core-kit/types/errors";
import { PipelineEvent } from "models/events";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { liveState } from "packages/launches/live-state";
import { PipelineEventType } from "types/pipeline";
import {
  getErrorResult,
  recordLaunchRun,
  recordNodeExecution,
} from "./run-metrics";
import { LAUNCH_ROOM } from "consts/rooms";

export default async (nodeJob: ProcessNodeJob, err: Error, job: Job) => {
  const logger = createLogger("process-node", {
    launch: nodeJob.launch,
    node: nodeJob.node,
  });

  const launch = await liveState.get(nodeJob.launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  const notifyNode = (node: string, event: PipelineEventType) => {
    notify(
      LAUNCH_ROOM(launch._id),
      event,
      mapTo({ launch: launch._id, node }, PipelineEvent)
    );
  };

  const {
    attemptsMade,
    opts: { attempts: maxAttempts },
  } = job;

  logger.error(`Error for attempt ${attemptsMade} from ${maxAttempts}`);

  const fatal =
    err instanceof FatalError ||
    err instanceof TimeoutError ||
    err instanceof MemoryLimitError;
  const lastAttempt = attemptsMade >= maxAttempts;

  // the status and the Launch's error are written together; each failure is
  // recorded once, even a fatal one on the last attempt
  await liveState.nodeFailed(
    launch._id,
    nodeJob.node,
    `${err.message}`,
    fatal
      ? { outcome: "fatal" }
      : lastAttempt
        ? { outcome: "exhausted" }
        : // the retry backoff is counted as wait time of the next run
          { outcome: "retry", job: job.id, dueAt: Date.now() }
  );
  notifyNode(nodeJob.node, "node_error");

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

  if (lastAttempt || fatal) {
    logger.error("Save error for launch");
    queues.launches.errors.set.plan({ launch: launch._id });

    await recordNodeExecution(launch, nodeJob.node, getErrorResult(err));
    await recordLaunchRun(launch, "error");
  }

  if (fatal) {
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
