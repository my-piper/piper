import { kick } from "logic/launches";
import { queues } from "../app/queue";
import {
  LAUNCH,
  LAUNCH_HEARTBEAT,
  LAUNCH_HEARTBEAT_EXPIRED,
} from "../consts/redis";
import { redis } from "../core-kit/services/redis/redis";
import { createLogger } from "../logger";
import { Launch } from "../models/launch";
import { RunLaunchJobResult } from "../types/launch";
import { readInstance } from "../utils/redis";

queues.launches.run.process(async (runJob) => {
  const logger = createLogger("run-launch", {
    launch: runJob.launch,
  });

  const launch = await readInstance(LAUNCH(runJob.launch), Launch);
  if (!launch) {
    logger.error("Launch is not found");
    return RunLaunchJobResult.LAUNCH_NOT_FOUND;
  }

  await redis.setEx(
    LAUNCH_HEARTBEAT(launch._id),
    LAUNCH_HEARTBEAT_EXPIRED,
    new Date().toISOString()
  );

  const { scope } = launch;

  if (scope.maxConcurrent > 0) {
    const SCOPE_KEY = scope.id;

    logger.debug(`Check scope ${SCOPE_KEY}`);
    const queue = (await redis.lRange(SCOPE_KEY, 0, -1)) || [];
    if (!queue.includes(launch._id)) {
      logger.debug(`Add launch to queue`);
      await redis.rPush(SCOPE_KEY, launch._id);
      queue.push(launch._id);
    }

    logger.debug(`Queue scope ${SCOPE_KEY}: ${queue.join("|")}`);

    let position = queue.indexOf(launch._id);
    logger.debug(`Pipeline position ${position}`);

    for (let i = 0; i < position; ) {
      const l = queue[i];
      if (!(await redis.exists(LAUNCH_HEARTBEAT(l)))) {
        logger.debug(`Remove dead launch ${l} from queue`);
        queue.splice(i, 1);
        await redis.lRem(SCOPE_KEY, 0, l);
      } else {
        logger.debug(`Launch ${l} is live`);
        i++;
      }
    }

    position = queue.indexOf(launch._id);
    logger.debug(
      `Pipeline live position ${position} in ${scope.maxConcurrent}`
    );
    if (position >= scope.maxConcurrent) {
      logger.debug("Waiting in scope queue");
      await queues.launches.run.plan(
        {
          launch: launch._id,
        },
        { delay: 5000 }
      );
      return RunLaunchJobResult.WAITING_IN_SCOPE_QUEUE;
    }
  }

  logger.info("Pipeline can run");

  await kick(launch);
  return RunLaunchJobResult.RUN_LAUNCH;
});
