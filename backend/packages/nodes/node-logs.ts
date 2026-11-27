import {
  LAUNCH,
  LAUNCH_EXPIRED,
  NODE_LOGS,
  NODE_LOGS_DROPPED,
  NODE_LOGS_LIMIT,
} from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis, { exists } from "core-kit/packages/redis";
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
  const key = NODE_LOGS(launch, node);
  const length = await redis.rPush(
    key,
    entries.map(({ ts, message, level }) =>
      JSON.stringify(
        toPlain(
          mapTo({ ts, message, level: normalizeLevel(level), attempt }, NodeLog)
        )
      )
    )
  );
  await redis.expire(key, LAUNCH_EXPIRED);

  const overflow = length - NODE_LOGS_LIMIT;
  if (overflow > 0) {
    await redis.lTrim(key, -NODE_LOGS_LIMIT, -1);
    const dropped = NODE_LOGS_DROPPED(launch, node);
    await redis.incrBy(dropped, overflow);
    await redis.expire(dropped, LAUNCH_EXPIRED);
  }
}

// The Node Logs of a launch's nodes, oldest first. Lines without a timestamp
// keep their node's order and come before the timestamped ones.
export async function readLaunchLogs(
  launch: string,
  node?: string
): Promise<LaunchLogs> {
  if (!(await exists(LAUNCH(launch)))) {
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
    const lines = await redis.lRange(NODE_LOGS(launch, key), 0, -1);
    logs.push(
      ...lines.map((line) => {
        const log = JSON.parse(line);
        return toInstance(
          { ...log, level: normalizeLevel(log.level), node: key },
          LaunchLog
        );
      })
    );
    const count = Number(await redis.get(NODE_LOGS_DROPPED(launch, key)));
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
