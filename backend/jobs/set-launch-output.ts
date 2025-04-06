import mongo from "app/mongo";
import { notify } from "core-kit/services/io";
import { createLogger } from "core-kit/services/logger";
import redis from "core-kit/services/redis";
import { mapTo, toPlain } from "core-kit/utils/models";
import { SetLaunchOutputEvent } from "models/events";
import { Launch, LaunchOutput } from "models/launch";
import { User } from "models/user";
import { ulid } from "ulid";
import { fromRedisValue, readInstance } from "utils/redis";
import { sid } from "utils/string";
import { queues } from "../app/queues";
import { LAUNCH, PIPELINE_OUTPUT } from "../consts/redis";
import { getIOData } from "../logic/launches/launching";

queues.launches.outputs.set.process(async (setOutputJob) => {
  const logger = createLogger("fill-launch-output", {
    launch: setOutputJob.launch,
  });

  logger.info(
    `Set output ${setOutputJob.output} in launch ${setOutputJob.launch}`
  );
  const launch = await readInstance(LAUNCH(setOutputJob.launch), Launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  const json = await redis.get(
    PIPELINE_OUTPUT(launch._id, setOutputJob.output)
  );
  if (json == null) {
    logger.error("Output has no value");
    return;
  }

  const { type, title } = launch.pipeline.outputs.get(setOutputJob.output);
  const { launchedBy } = launch;

  const output = new LaunchOutput({
    _id: sid(),
    launch: launch._id,
    filledAt: new Date(),
    launchedBy: !!launchedBy
      ? (() => {
          const { _id } = launchedBy;
          return new User({ _id });
        })()
      : null,
    type,
    title,
    data: await getIOData(
      launch._id,
      "outputs",
      setOutputJob.output,
      type,
      fromRedisValue(type, json)
    ),
    cursor: ulid(),
  });

  const plain = toPlain(output);

  await mongo.launchOutputs.insertOne(plain as { _id: string });
  await mongo.launches.updateOne({ _id: launch._id }, [
    {
      $set: {
        outputs: {
          $mergeObjects: [
            "$outputs",
            {
              [setOutputJob.output]: {
                $mergeObjects: [
                  ["$outputs", setOutputJob.output].join("."),
                  plain,
                ],
              },
            },
          ],
        },
      },
    },
  ]);

  const event = mapTo(
    {
      launch: launch._id,
      id: setOutputJob.output,
      output,
    },
    SetLaunchOutputEvent
  );
  if (!!launchedBy) {
    notify(launchedBy._id, "set_output", event);
  }
});
