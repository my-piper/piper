import { queues } from "app/queues";
import { createLogger } from "core-kit/packages/logger";
import { DelayedError } from "core-kit/packages/queue";
import random from "lodash/random";
import { kick } from "packages/launches";
import { liveState } from "packages/launches/live-state";
import { RunLaunchJobResult } from "types/launch";

const REPEAT_DELAY = 5000;

queues.launches.run.process(async (runJob, job) => {
  const logger = createLogger("run-launch", {
    launch: runJob.launch,
  });

  logger.info("Check if pipeline can run");

  await liveState.beat(runJob.launch);

  const { scope } = runJob;
  const { maxConcurrent } = scope;

  logger.debug(`Max concurrent is ${maxConcurrent}`);
  if (maxConcurrent > 0) {
    const count = Math.ceil(maxConcurrent * 1.75);
    logger.debug(`Retrieve ${count} launches from scope ${scope.id}`);
    // dead launches (without a heartbeat) leave the scope on the way
    const { waiting, live } = await liveState.scopeQueue(scope.id, count);
    if (waiting > 0) {
      logger.debug(`Live in scope ${scope.id}: ${live.join(" | ")}`);

      const position = live.indexOf(runJob.launch);
      if (position !== -1) {
        logger.debug(`Position in queue ${position}`);

        if (position >= maxConcurrent) {
          logger.debug("Continue wait in scope queue");
          await job.moveToDelayed(
            Date.now() + REPEAT_DELAY + random(1000, 3000),
            job.token
          );
          throw new DelayedError();
        }
      } else {
        logger.debug("Waiting in scope queue");

        await job.moveToDelayed(Date.now() + 10000, job.token);
        throw new DelayedError();
      }
    } else {
      logger.debug(`Queue scope ${scope.id} is empty`);
    }
  }

  logger.info("Pipeline can run");

  const launch = await liveState.get(runJob.launch);
  if (!launch) {
    logger.error("Launch is not found");
    return RunLaunchJobResult.LAUNCH_NOT_FOUND;
  }

  await kick(launch);
  return RunLaunchJobResult.RUN_LAUNCH;
});
