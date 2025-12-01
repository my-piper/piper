import mongo from "app/mongo";
import { queues } from "app/queues";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  PIPELINE_OUTPUT,
  PIPELINE_OUTPUT_DATA,
} from "consts/redis";
import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import redis, { readInstance } from "core-kit/packages/redis";
import { mapTo, toPlain } from "core-kit/packages/transform";
import { SetLaunchOutputEvent } from "models/events";
import { Launch, LaunchArtefact, OUTPUT_TYPES } from "models/launch";
import { User } from "models/user";
import { getIOData } from "packages/launches/launching";
import { ulid } from "ulid";
import { fromRedisValue } from "utils/redis";
import { sid } from "utils/string";

queues.launches.outputs.set.process(async (setOutputJob) => {
  const logger = createLogger("set-launch-output", {
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

  const value = await redis.get(
    PIPELINE_OUTPUT(launch._id, setOutputJob.output)
  );
  if (value == null) {
    logger.error("Output has no value");
    return;
  }

  const { type, title } = launch.pipeline.outputs.get(setOutputJob.output);
  const { launchedBy } = launch;

  const data = await getIOData(
    launch._id,
    "outputs",
    setOutputJob.output,
    type,
    fromRedisValue(type, value)
  );
  await redis.setEx(
    PIPELINE_OUTPUT_DATA(launch._id, setOutputJob.output),
    LAUNCH_EXPIRED,
    JSON.stringify(
      (() => {
        const plain = toPlain(data);
        for (const type of Object.keys(OUTPUT_TYPES)) {
          if (data instanceof OUTPUT_TYPES[type]) {
            plain["type"] = type;
          }
        }
        return plain;
      })()
    )
  );

  const output = new LaunchArtefact({
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
    data,
    cursor: ulid(),
  });

  const plain = toPlain(output);
  await mongo.launchArtefacts.insertOne(plain as { _id: string });
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

  if (!!launchedBy) {
    const event = mapTo(
      {
        launch: launch._id,
        id: setOutputJob.output,
        output,
      },
      SetLaunchOutputEvent
    );
    notify(launchedBy._id, "set_output", event);
  }
});
