import { queues } from "app/queues";
import { createLogger } from "core-kit/packages/logger";
import { liveState } from "packages/launches/live-state";
import { recordInterrupted } from "packages/launches/run-metrics";

// the API server, which interrupts Launches, sends no streams itself
queues.launches.interrupted.record.process(async ({ launch: id }) => {
  const logger = createLogger("record-launch-interrupted", { launch: id });

  const [launch, interruptedAt] = await Promise.all([
    liveState.get(id),
    liveState.interruptedAt(id),
  ]);
  if (!launch || !interruptedAt) {
    logger.error("Interrupted launch is not found");
    return;
  }

  logger.info("Record interrupted launch");
  await recordInterrupted(launch, interruptedAt);
});
