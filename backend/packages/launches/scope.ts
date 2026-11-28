import { createLogger } from "core-kit/packages/logger";
import random from "lodash/random";
import { Launch } from "models/launch";
import { RunScope } from "models/run-scope";
import { liveState } from "./live-state";

const logger = createLogger("launch-scope");

// how long a Launch that has a place in the scope waits before it looks again
const QUEUED_DELAY = 5000;
// how long a Launch without a place in the scope waits
const UNQUEUED_DELAY = 10000;

/**
 * A Launch's turn in its concurrency scope: how many milliseconds it still
 * waits before it may start, or 0 when it may start now. Only the first
 * `maxConcurrent` live Launches of the scope run; dead ones (without a
 * heartbeat) leave it on the way.
 */
export async function turnInScope(
  launch: string,
  { id, maxConcurrent }: RunScope
): Promise<number> {
  logger.debug(`Max concurrent is ${maxConcurrent}`);
  if (!(maxConcurrent > 0)) {
    return 0;
  }

  const count = Math.ceil(maxConcurrent * 1.75);
  logger.debug(`Retrieve ${count} launches from scope ${id}`);
  const { waiting, live } = await liveState.scopeQueue(id, count);
  if (waiting === 0) {
    logger.debug(`Queue scope ${id} is empty`);
    return 0;
  }

  logger.debug(`Live in scope ${id}: ${live.join(" | ")}`);
  const position = live.indexOf(launch);
  if (position === -1) {
    logger.debug("Waiting in scope queue");
    return UNQUEUED_DELAY;
  }

  logger.debug(`Position in queue ${position}`);
  return position >= maxConcurrent ? QUEUED_DELAY + random(1000, 3000) : 0;
}

/** A finished Launch gives its place in the scope to the next one. */
export async function leaveScope({ _id, scope }: Launch): Promise<void> {
  if (scope) {
    logger.info(`Remove launch ${_id} from scope ${scope.id}`);
    await liveState.leaveScope(scope.id, _id);
  }
}
