import mongo from "app/mongo";
import { LAUNCH, PIPELINE_ERRORS } from "consts/redis";
import { notify } from "core-kit/services/io";
import { createLogger } from "core-kit/services/logger";
import redis from "core-kit/services/redis/redis";
import { toPlain } from "core-kit/utils/models";
import { SetLaunchErrorsEvent } from "models/events";
import { Launch } from "models/launch";
import { readInstance } from "utils/redis";
import { queues } from "../app/queues";

queues.launches.errors.set.process(async (setErrorsJob) => {
  const logger = createLogger("set-launch-errors", {
    launch: setErrorsJob.launch,
  });

  const launch = await readInstance(LAUNCH(setErrorsJob.launch), Launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  logger.info(`Set errors for launch ${launch}`);
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
