import { createLogger } from "core-kit/packages/logger";
import { mapTo, toInstance, toPlain } from "core-kit/packages/transform";
import {
  LaunchLog,
  LaunchLogs,
  LOG_LEVELS,
  LogLevel,
  NodeLog,
} from "models/node";
import { LogEntry } from "packages/deno";
import * as launching from "packages/launches/launching";
import { liveState } from "packages/launches/live-state";

const logger = createLogger("node-logs");

const warned = new Set<string>();

// Deno records console.log as "log"; any other level Piper does not know
// becomes "info" too, so the logs panel never hides a line.
export function normalizeLevel(level: string): LogLevel {
  if ((LOG_LEVELS as readonly string[]).includes(level)) {
    return level as LogLevel;
  }
  if (level !== "log" && !warned.has(level)) {
    warned.add(level);
    logger.warn(`Unknown node log level "${level}", stored as "info"`);
  }
  return "info";
}

// Appends one attempt's lines and keeps only the newest NODE_LOGS_LIMIT,
// counting the lines it drops.
export async function appendNodeLogs(
  launch: string,
  node: string,
  attempt: number,
  entries: LogEntry[]
): Promise<void> {
  await liveState.appendLogs(
    launch,
    node,
    entries.map(({ ts, message, level }) =>
      toPlain(
        mapTo({ ts, message, level: normalizeLevel(level), attempt }, NodeLog)
      )
    )
  );
}

// The Node Logs of a launch's nodes, oldest first. Lines without a timestamp
// keep their node's order and come before the timestamped ones.
export async function readLaunchLogs(
  launch: string,
  node?: string
): Promise<LaunchLogs> {
  if (!(await liveState.exists(launch))) {
    return new LaunchLogs({ available: false, logs: [], dropped: {} });
  }

  const { pipeline } = await launching.get(launch);
  const nodes = node
    ? pipeline.nodes.has(node)
      ? [node]
      : []
    : [...pipeline.nodes.keys()];

  const logs: LaunchLog[] = [];
  const dropped: Record<string, number> = {};
  for (const key of nodes) {
    const { lines, dropped: count } = await liveState.logs(launch, key);
    logs.push(
      ...lines.map((log: { level?: string }) => {
        return toInstance(
          { ...log, level: normalizeLevel(log.level), node: key },
          LaunchLog
        );
      })
    );
    if (count > 0) {
      dropped[key] = count;
    }
  }

  return new LaunchLogs({
    available: true,
    // the sort is stable, so each node keeps its own order among equal times
    logs: logs.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
    dropped,
  });
}
