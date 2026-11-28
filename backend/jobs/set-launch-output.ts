import mongo from "app/mongo";
import { queues } from "app/queues";
import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { mapTo, toPlain } from "core-kit/packages/transform";
import { SetLaunchOutputEvent } from "models/events";
import { LaunchArtefact, OUTPUT_TYPES } from "models/launch";
import { User } from "models/user";
import { getIOData } from "packages/launches/launching";
import { liveState } from "packages/launches/live-state";
import { ulid } from "ulid";
import { sid } from "utils/string";
import { USER_ROOM } from "consts/rooms";

queues.launches.outputs.set.process(async (job) => {
  const logger = createLogger("set-launch-output", {
    launch: job.launch,
  });

  logger.info(`Set output ${job.output} in launch ${job.launch}`);
  const launch = await liveState.get(job.launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  const value = await liveState.output(launch, job.output);
  if (value === undefined) {
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
    value
  );
  await liveState.setOutputData(
    launch._id,
    job.output,
    (() => {
      const plain = toPlain(data);
      for (const type of Object.keys(OUTPUT_TYPES)) {
        if (data instanceof OUTPUT_TYPES[type]) {
          plain["type"] = type;
        }
      }
      return plain;
    })()
  );

  const output = new LaunchArtefact({
    _id: sid(),
    project: project._id,
    launch: launch._id,
    filledAt: new Date(),
    launchedBy: launchedBy
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

  if (launchedBy) {
    const event = mapTo(
      {
        launch: launch._id,
        id: job.output,
        output,
      },
      SetLaunchOutputEvent
    );
    notify(USER_ROOM(launchedBy._id), "set_output", event);
  }
});
