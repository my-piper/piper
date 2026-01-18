import { queues } from "app/queues";
import {
  LAUNCH,
  LAUNCH_HEARTBEAT,
  LAUNCH_HEARTBEAT_EXPIRED,
} from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis, { readInstance } from "core-kit/packages/redis";
import random from "lodash/random";
import { Launch } from "models/launch";
import { kick } from "packages/launches";
import { RunLaunchJobResult } from "types/launch";

const REPEAT_DELAY = 5000;

queues.launches.run.process(async (runJob, job) => {
  const logger = createLogger("run-launch", {
    launch: runJob.launch,
  });

  logger.info("Check if pipeline can run");

  await redis.setEx(
    LAUNCH_HEARTBEAT(runJob.launch),
    LAUNCH_HEARTBEAT_EXPIRED,
    new Date().toISOString()
  );

  const { scope } = runJob;
  const { maxConcurrent } = scope;

  logger.debug(`Max concurrent is ${maxConcurrent}`);
  if (maxConcurrent > 0) {
    const count = Math.ceil(maxConcurrent * 1.75);
    logger.debug(`Retrieve ${count} launches from scope ${scope.id}`);
    const queue = (await redis.lRange(scope.id, 0, count)) || [];
    if (queue.length > 0) {
      logger.debug(`Queue scope ${scope.id}: ${queue.join(" | ")}`);

      const multi = redis.multi();
      queue.forEach((id) => multi.exists(LAUNCH_HEARTBEAT(id)));
      const heartbeats = await multi.exec();
      const dead = queue.filter((_, i) => heartbeats[i] === 0);
      if (dead.length > 0) {
        logger.debug(`Dead launches: ${dead.join(" | ")}`);
        await Promise.all(dead.map((id) => redis.lRem(scope.id, 0, id)));
      }

      const position = queue.indexOf(runJob.launch);
      if (position !== -1) {
        logger.debug(`Position in queue ${position}`);

        if (position >= scope.maxConcurrent - dead.length) {
          logger.debug("Continue wait in scope queue");
          await job.moveToDelayed(
            Date.now() + REPEAT_DELAY + random(1000, 3000)
          );
          return RunLaunchJobResult.WAITING_IN_SCOPE_QUEUE;
        }
      } else {
        logger.debug("Waiting in scope queue");

        await job.moveToDelayed(Date.now() + 10000);
        return RunLaunchJobResult.WAITING_IN_SCOPE_QUEUE;
      }
    } else {
      logger.debug(`Queue scope ${scope.id} is empty`);
    }
  }

  logger.info("Pipeline can run");

  const launch = await readInstance(LAUNCH(runJob.launch), Launch);
  if (!launch) {
    logger.error("Launch is not found");
    return RunLaunchJobResult.LAUNCH_NOT_FOUND;
  }

  await kick(launch);
  return RunLaunchJobResult.RUN_LAUNCH;
});
