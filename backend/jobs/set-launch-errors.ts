import mongo from "app/mongo";
import { queues } from "app/queues";
import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { toPlain } from "core-kit/packages/transform";
import { SetLaunchErrorsEvent } from "models/events";
import { liveState } from "packages/launches/live-state";
import { USER_ROOM } from "consts/rooms";

queues.launches.errors.set.process(async (setErrorsJob) => {
  const logger = createLogger("set-launch-errors", {
    launch: setErrorsJob.launch,
  });

  const launch = await liveState.get(setErrorsJob.launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  logger.info(`Set errors for launch ${launch._id}`);
  const errors = await liveState.errors(launch._id);
  await mongo.launches.updateOne({ _id: launch._id }, { $set: { errors } });

  const event = toPlain(
    new SetLaunchErrorsEvent({
      launch: launch._id,
      errors,
    })
  );
  const { launchedBy } = launch;
  if (launchedBy) {
    notify(USER_ROOM(launchedBy._id), "set_errors", event);
  }
});
