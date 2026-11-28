import { queues } from "app/queues";
import { streams } from "app/streams";
import { BASE_URL } from "consts/core";
import { getLabel } from "core-kit/packages/i18n";
import { DEFAULT_LANGUAGE } from "core-kit/packages/locale";
import type { Logger } from "core-kit/packages/logger";
import { DelayedError, Job } from "core-kit/packages/queue";
import sentry from "core-kit/packages/sentry";
import { mapTo } from "core-kit/packages/transform";
import {
  FatalError,
  MemoryLimitError,
  TimeoutError,
} from "core-kit/types/errors";
import { differenceInSeconds } from "date-fns";
import { PipelineEvent } from "models/events";
import { Launch } from "models/launch";
import { startChildren } from "packages/launches/child-launches";
import { liveState } from "packages/launches/live-state";
import {
  getErrorResult,
  recordLaunchRun,
  recordNodeExecution,
  recordNodeRun,
} from "packages/launches/run-metrics";
import { leaveScope } from "packages/launches/scope";
import { NodeOutcome } from "packages/nodes/outcome";
import { NodeJobResult } from "types/node";
import { PipelineEventType } from "types/pipeline";
import { completeNode } from "./complete-node";

// a repeat without a delay runs again after a second
const DEFAULT_REPEAT_DELAY = 1000;

/** One run of a Node by a queue job, as its outcome is applied. */
export type NodeRun = {
  launch: Launch;
  node: string;
  job: Job;
  attempt: number;
  startedAt: Date;
  // when the job was due to run: planned time plus delay, or the repeat time
  dueAt: number;
  finishedAt: number;
};

export type OutcomeNotifier = {
  node: (node: string, event: PipelineEventType) => void;
  pipeline: (type: PipelineEventType, event?: object) => void;
  user: (type: PipelineEventType, event?: object) => void;
};

type ApplyContext = { logger: Logger; notify: OutcomeNotifier };

// The job runs again at dueAt. BullMQ needs a processor that delayed its own
// job to throw DelayedError, so this is the one place that throws it.
async function runAgainAt(job: Job, dueAt: number): Promise<never> {
  await job.moveToDelayed(dueAt);
  throw new DelayedError();
}

// what the Node keeps until it runs again, and when that is due
async function keepForRepeat(
  { launch, node, job }: NodeRun,
  delay: number | undefined,
  keep: { state?: object; progress?: object } = {}
): Promise<number> {
  const dueAt = Date.now() + (delay || DEFAULT_REPEAT_DELAY);
  await liveState.nodeRepeats(launch._id, node, job.id, { dueAt, ...keep });
  return dueAt;
}

// every pipeline output the Launch waits for has a value
async function launchFinished(
  launch: Launch,
  { logger, notify }: ApplyContext
): Promise<void> {
  const finishedAt = new Date();
  logger.info("Launch is finished");
  await leaveScope(launch);

  streams.pipeline.metrics.finished.send({
    launch: launch._id,
    finishedAt,
    fromStart: differenceInSeconds(finishedAt, launch.launchedAt),
  });
  await recordLaunchRun(launch, "done", finishedAt);

  notify.user("pipeline_done", mapTo({ launch: launch._id }, PipelineEvent));
}

/**
 * Applies what a Node's run came to: starts its Child Launches, repeats it,
 * completes it, or fails its attempt. The run is recorded here, once per
 * outcome. A repeat or a Child Launch delays the job (it throws BullMQ's
 * DelayedError); an error is rethrown for the queue to retry or fail the job,
 * which then calls `applyFailure`.
 */
export async function applyOutcome(
  run: NodeRun,
  outcome: NodeOutcome,
  context: ApplyContext
): Promise<NodeJobResult> {
  const { launch, node, finishedAt } = run;
  const { logger, notify } = context;

  switch (outcome.type) {
    case "launch": {
      logger.debug(`Node ${node} starts ${outcome.launches.length} children`);
      try {
        await startChildren(launch, node, outcome.launches);
      } catch (e) {
        await recordNodeRun(run, getErrorResult(e as Error), finishedAt);
        throw e;
      }

      notify.node(node, "node_gonna_repeat");
      await recordNodeRun(run, "repeat", finishedAt);
      return runAgainAt(run.job, await keepForRepeat(run, outcome.delay));
    }
    case "repeat": {
      const { delay, state, progress } = outcome;
      // the state and progress are kept before anything else can fail, so a
      // retry of this job resumes from them
      const dueAt = await keepForRepeat(run, delay, { state, progress });
      if (progress) {
        logger.debug(progress);
        notify.node(node, "node_progress");
      }

      logger.debug(`Node ${node} is going to repeat with delay ${delay}`);
      notify.node(node, "node_gonna_repeat");

      await recordNodeRun(run, "repeat", finishedAt);
      return runAgainAt(run.job, dueAt);
    }
    case "next": {
      await recordNodeRun(run, "done", finishedAt);
      const { finished } = await completeNode(
        {
          launch,
          node,
          logger,
          notifyNode: notify.node,
          notifyPipeline: notify.pipeline,
        },
        outcome.next
      );
      if (finished) {
        await launchFinished(launch, context);
      }
      return NodeJobResult.NODE_PROCESSED;
    }
    case "error":
      await recordNodeRun(run, getErrorResult(outcome.error), finishedAt);
      throw outcome.error;
  }
}

function isFatal(error: Error): boolean {
  return (
    error instanceof FatalError ||
    error instanceof TimeoutError ||
    error instanceof MemoryLimitError
  );
}

/**
 * Applies a failed attempt of a Node's job, called by the queue after each
 * one: the Node runs again on a retry, or fails the Launch when the error is
 * fatal or no attempts are left.
 */
export async function applyFailure(
  { launch, node, job }: Pick<NodeRun, "launch" | "node" | "job">,
  error: Error,
  { logger, notify }: { logger: Logger; notify: Pick<OutcomeNotifier, "node"> }
): Promise<void> {
  const {
    attemptsMade,
    opts: { attempts: maxAttempts },
  } = job;

  logger.error(`Error for attempt ${attemptsMade} from ${maxAttempts}`);

  const fatal = isFatal(error);
  const lastAttempt = attemptsMade >= maxAttempts;

  // the status and the Launch's error are written together; each failure is
  // recorded once, even a fatal one on the last attempt
  await liveState.nodeFailed(
    launch._id,
    node,
    `${error.message}`,
    fatal
      ? { outcome: "fatal" }
      : lastAttempt
        ? { outcome: "exhausted" }
        : // the retry backoff is counted as wait time of the next run
          { outcome: "retry", job: job.id, dueAt: Date.now() }
  );
  notify.node(node, "node_error");

  const { project } = launch;
  await streams.pipeline.errors.send({
    occurredAt: new Date(),
    launch: launch._id,
    project: project._id,
    projectTitle: getLabel(project.title, DEFAULT_LANGUAGE),
    node,
    nodeTitle: getLabel(
      launch.pipeline.nodes.get(node).title,
      DEFAULT_LANGUAGE
    ),
    attempt: attemptsMade,
    maxAttempts,
    message: error.message,
  });

  if (lastAttempt || fatal) {
    logger.error("Save error for launch");
    queues.launches.errors.set.plan({ launch: launch._id });

    await recordNodeExecution(launch, node, getErrorResult(error));
    await recordLaunchRun(launch, "error");
  }

  if (fatal) {
    try {
      await job.remove();
    } catch (e) {
      logger.error(e);
    }
  } else {
    logger.error(error);
    sentry.captureException(error, {
      extra: {
        launch: launch._id,
        node,
        url: `${BASE_URL}/launches/${launch._id}/nodes/${node}`,
      },
    });
  }
}
