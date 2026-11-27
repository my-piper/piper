import { streams } from "app/streams";
import {
  LAUNCH_EXPIRED,
  LAUNCH_RUN_RECORDED,
  NODE_EXECUTION,
} from "consts/redis";
import redis from "core-kit/packages/redis";
import { MemoryLimitError, TimeoutError } from "core-kit/types/errors";
import { Launch } from "models/launch";
import { LaunchRunStatus } from "models/launch-run";
import { NodeExecutionResult } from "models/node-execution-record";
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

export function getErrorResult(
  error: Error
): Exclude<NodeRunResult, "done" | "repeat"> {
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
  const waitMs = toMs(startedAt.getTime() - dueAt);
  const durationMs = toMs(finishedAt - startedAt.getTime());
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
    waitMs,
    durationMs,
  });

  const key = NODE_EXECUTION(launch._id, node);
  await redis
    .multi()
    .hSetNX(key, "startedAt", String(startedAt.getTime()))
    .hSetNX(key, "waitMs", String(waitMs))
    .hIncrBy(key, "activeMs", durationMs)
    .hIncrBy(key, "invocations", 1)
    .hSet(key, {
      attempts: String(attempt + 1),
      finishedAt: String(finishedAt),
    })
    .expire(key, LAUNCH_EXPIRED)
    .exec();

  // an error ends the execution only on its last attempt, which
  // process-node-error decides
  if (result === "done") {
    await recordNodeExecution(launch, node, "done");
  }
}

// Sends the node's open execution, if any, with this outcome and closes it.
// Without finishedAt the execution ends with its last invocation.
export async function recordNodeExecution(
  launch: Launch,
  node: string,
  result: NodeExecutionResult,
  finishedAt?: Date
) {
  const key = NODE_EXECUTION(launch._id, node);
  const [open] = (await redis.multi().hGetAll(key).del(key).exec()) as [
    Record<string, string>,
    number,
  ];
  if (!open?.startedAt) {
    return;
  }

  const startedAt = Number(open.startedAt);
  const finished = finishedAt?.getTime() ?? Number(open.finishedAt);
  const { project, pipeline, launchedBy } = launch;
  await streams.pipeline.runs.executions.send({
    startedAt: new Date(startedAt),
    finishedAt: new Date(finished),
    launch: launch._id,
    project: project?._id,
    pipeline: pipeline.name,
    node,
    launchedBy: launchedBy?._id,
    execution: pipeline.nodes.get(node)?.execution,
    result,
    waitMs: toMs(Number(open.waitMs)),
    durationMs: toMs(finished - startedAt),
    activeMs: toMs(Number(open.activeMs)),
    invocations: toMs(Number(open.invocations)),
    attempts: toMs(Number(open.attempts)),
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
