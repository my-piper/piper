import { streams } from "app/streams";
import { LAUNCH_EXPIRED, LAUNCH_RUN_RECORDED } from "consts/redis";
import redis from "core-kit/packages/redis";
import { MemoryLimitError, TimeoutError } from "core-kit/types/errors";
import { Launch } from "models/launch";
import { LaunchRunStatus } from "models/launch-run";
import { NodeRunResult } from "models/node-run";

type NodeRunContext = {
  launch: Launch;
  node: string;
  attempt: number;
  startedAt: Date;
  // when the job was due to run: planned time plus delay, or the repeat time
  dueAt: number;
};

const toMs = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

export function getErrorResult(error: Error): NodeRunResult {
  if (error instanceof TimeoutError) {
    return "timeout";
  }
  if (error instanceof MemoryLimitError) {
    return "memory";
  }
  return "error";
}

export async function recordNodeRun(
  { launch, node, attempt, startedAt, dueAt }: NodeRunContext,
  result: NodeRunResult,
  finishedAt: number = Date.now()
) {
  const { project, pipeline, launchedBy } = launch;
  await streams.pipeline.runs.nodes.send({
    startedAt,
    launch: launch._id,
    project: project?._id,
    pipeline: pipeline.name,
    node,
    launchedBy: launchedBy?._id,
    execution: pipeline.nodes.get(node)?.execution,
    attempt,
    result,
    waitMs: toMs(startedAt.getTime() - dueAt),
    durationMs: toMs(finishedAt - startedAt.getTime()),
  });
}

// Sends one row per launch: the first outcome wins, later ones are ignored.
export async function recordLaunchRun(
  launch: Launch,
  status: LaunchRunStatus,
  finishedAt: Date = new Date()
) {
  const recorded = await redis.set(LAUNCH_RUN_RECORDED(launch._id), status, {
    NX: true,
    EX: LAUNCH_EXPIRED,
  });
  if (recorded !== "OK") {
    return;
  }

  const { project, pipeline, launchedBy, scope, launchedAt } = launch;
  const startedAt = launch.startedAt ?? launchedAt;
  await streams.pipeline.runs.launches.send({
    launchedAt,
    startedAt,
    finishedAt,
    launch: launch._id,
    project: project?._id,
    pipeline: pipeline.name,
    launchedBy: launchedBy?._id,
    scope: scope?.id,
    status,
    queuedMs: toMs(startedAt.getTime() - launchedAt.getTime()),
    durationMs: toMs(finishedAt.getTime() - startedAt.getTime()),
  });
}
