import { toPlain } from "core-kit/utils/models";
import io from "../app/io";
import mongo from "../app/mongo";
import { queues } from "../app/queue";
import { PIPELINE_ERRORS } from "../consts/redis";
import { redis } from "../core-kit/services/redis/redis";
import { createLogger } from "../logger";
import { SetLaunchErrorsEvent } from "../models/events";

queues.launches.errors.set.process(async (setErrorsJob) => {
  const logger = createLogger("set-launch-errors", {
    launch: setErrorsJob.launch,
  });

  const { launch } = setErrorsJob;

  logger.info(`Set errors for launch ${launch}`);
  const errors = (await redis.lRange(PIPELINE_ERRORS(launch), 0, -1)) || [];
  await mongo.launches.updateOne({ _id: launch }, { $set: { errors } });

  const event = toPlain(
    new SetLaunchErrorsEvent({
      launch: launch,
      errors,
    })
  );
  io.to("launch_errors").emit("set_errors", event);
  io.to(launch).emit("set_errors", event);
});
