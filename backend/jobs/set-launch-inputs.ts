import mongo from "app/mongo";
import { queues } from "app/queues";
import { LAUNCH } from "consts/redis";
import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { toPlain } from "core-kit/packages/transform";
import { SetLaunchInputsEvent } from "models/events";
import { Launch, LaunchInput } from "models/launch";
import { getIOData } from "packages/launches";
import { readInstance } from "utils/redis";

queues.launches.inputs.set.process(async (setInputsJob) => {
  const logger = createLogger("set-launch-inputs", {
    launch: setInputsJob.launch,
  });

  logger.info(`Set inputs for launch ${setInputsJob.launch}`);
  const launch = await readInstance(LAUNCH(setInputsJob.launch), Launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  const { _id, pipeline, launchRequest, launchedBy } = launch;
  if (!pipeline.inputs) {
    logger.error("Pipeline has no inputs");
    return;
  }
  const inputs = new Map<string, LaunchInput>();
  for (const [id, input] of pipeline.inputs) {
    let value = launchRequest.inputs?.get(id) || input.default;
    if (value !== undefined) {
      const { type, title, order } = input;
      inputs.set(
        id,
        new LaunchInput({
          title,
          type,
          order,
          data: await getIOData(_id, "inputs", id, type, value),
        })
      );
    }
  }

  await mongo.launches.updateOne(
    { _id },
    { $set: toPlain(new Launch({ inputs })) }
  );

  if (!!launchedBy) {
    const event = new SetLaunchInputsEvent({
      launch: launch._id,
      inputs,
    });
    notify(launchedBy._id, "set_inputs", event);
  }
});
