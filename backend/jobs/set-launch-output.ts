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

queues.launches.outputs.set.process(async (job) => {
  const logger = createLogger("set-launch-output", {
    launch: job.launch,
  });

  logger.info(`Set output ${job.output} in launch ${job.launch}`);
  const launch = await readInstance(LAUNCH(job.launch), Launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  const value = await redis.get(PIPELINE_OUTPUT(launch._id, job.output));
  if (value == null) {
    logger.error("Output has no value");
    return;
  }

  const { type, title } = launch.pipeline.outputs.get(job.output);
  const { project, launchRequest, launchedBy } = launch;

  const data = await getIOData(
    launch._id,
    launchRequest.options?.bucket,
    "outputs",
    job.output,
    type,
    fromRedisValue(type, value)
  );
  await redis.setEx(
    PIPELINE_OUTPUT_DATA(launch._id, job.output),
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
    project: project._id,
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
              [job.output]: {
                $mergeObjects: [["$outputs", job.output].join("."), plain],
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
        id: job.output,
        output,
      },
      SetLaunchOutputEvent
    );
    notify(launchedBy._id, "set_output", event);
  }
});
