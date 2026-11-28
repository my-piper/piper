import { streams } from "app/streams";
import { MemoryLimitError, TimeoutError } from "core-kit/types/errors";
import { Launch } from "models/launch";
import { LaunchRunStatus } from "models/launch-run";
import { NodeExecutionResult } from "models/node-execution-record";
import { NodeRunResult } from "models/node-run";
import { liveState } from "./live-state";

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

  await liveState.addInvocation(launch._id, node, {
    startedAt,
    finishedAt,
    waitMs,
    durationMs,
    attempt,
  });

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
  const open = await liveState.closeExecution(launch._id, node);
  if (!open) {
    return;
  }

  const { startedAt } = open;
  const finished = finishedAt?.getTime() ?? open.finishedAt;
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
    waitMs: toMs(open.waitMs),
    durationMs: toMs(finished - startedAt),
    activeMs: toMs(open.activeMs),
    invocations: toMs(open.invocations),
    attempts: toMs(open.attempts),
  });
}

// Sends one row per launch: the first outcome wins, later ones are ignored.
export async function recordLaunchRun(
  launch: Launch,
  status: LaunchRunStatus,
  finishedAt: Date = new Date()
) {
  if (!(await liveState.markRunRecorded(launch._id, status))) {
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

/**
 * Records an interrupted Launch at the interrupt time: the open execution of
 * each of the given Nodes (all of them by default) and the Launch's run.
 * Whatever was recorded before wins.
 */
export async function recordInterrupted(
  launch: Launch,
  interruptedAt: Date,
  nodes: string[] = [...launch.pipeline.nodes.keys()]
) {
  for (const node of nodes) {
    await recordNodeExecution(launch, node, "interrupted", interruptedAt);
  }
  await recordLaunchRun(launch, "interrupted", interruptedAt);
}
