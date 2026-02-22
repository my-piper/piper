import mongo from "app/mongo";
import { queues } from "app/queues";
import { LAUNCH, NODE_OUTPUTS } from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis, { readInstance } from "core-kit/packages/redis";
import sentry from "core-kit/packages/sentry";
import { toPlain } from "core-kit/packages/transform";
import { Launch, LaunchArtefact, OutputDataType } from "models/launch";
import { User } from "models/user";
import { getIOData } from "packages/launches/launching";
import { Primitive } from "types/primitive";
import { ulid } from "ulid";
import { sid } from "utils/string";

queues.launches.artefacts.save.process(async (job) => {
  const logger = createLogger("save-launch-artefacts", {
    launch: job.launch,
  });

  logger.info(`Save artefacts for node ${job.node} in launch ${job.launch}`);
  const launch = await readInstance(LAUNCH(job.launch), Launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  const { project, launchRequest, launchedBy } = launch;

  const value = await redis.get(NODE_OUTPUTS(launch._id, job.node));
  if (value == null) {
    logger.error("Node outputs not found");
    return;
  }

  const outputs = JSON.parse(value) as { [key: string]: Primitive };

  const node = launch.pipeline.nodes.get(job.node);
  for (const [key, output] of node.outputs) {
    const value = outputs[key];
    if (value === undefined) {
      continue;
    }

    const { title, type } = output;

    let data: OutputDataType;

    try {
      data = await getIOData(
        launch._id,
        launchRequest.options?.bucket,
        "nodes",
        [job.node, key].join("_"),
        type,
        value
      );
    } catch (e) {
      logger.error(e);
      sentry.captureException(e);
      continue;
    }

    const artefact = new LaunchArtefact({
      _id: sid(),
      project: project._id,
      launch: launch._id,
      node: job.node,
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

    const plain = toPlain(artefact);
    await mongo.launchArtefacts.insertOne(plain as { _id: string });
  }
});
