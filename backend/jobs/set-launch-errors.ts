import mongo from "app/mongo";
import { queues } from "app/queues";
import { LAUNCH, PIPELINE_ERRORS } from "consts/redis";
import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { readInstance } from "core-kit/packages/redis";
import redis from "core-kit/packages/redis/redis";
import { toPlain } from "core-kit/packages/transform";
import { SetLaunchErrorsEvent } from "models/events";
import { Launch } from "models/launch";

queues.launches.errors.set.process(async (setErrorsJob) => {
  const logger = createLogger("set-launch-errors", {
    launch: setErrorsJob.launch,
  });

  const launch = await readInstance(LAUNCH(setErrorsJob.launch), Launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  logger.info(`Set errors for launch ${launch._id}`);
  const errors = (await redis.lRange(PIPELINE_ERRORS(launch._id), 0, -1)) || [];
  await mongo.launches.updateOne({ _id: launch }, { $set: { errors } });

  const event = toPlain(
    new SetLaunchErrorsEvent({
      launch: launch._id,
      errors,
    })
  );
  const { launchedBy } = launch;
  if (!!launchedBy) {
    notify(launchedBy._id, "set_errors", event);
  }
});
