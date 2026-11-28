import mongo from "app/mongo";
import { queues } from "app/queues";
import { createLogger } from "core-kit/packages/logger";
import sentry from "core-kit/packages/sentry";
import { toPlain } from "core-kit/packages/transform";
import { LaunchArtefact, OutputDataType } from "models/launch";
import { User } from "models/user";
import { getIOData } from "packages/launches/launching";
import { liveState } from "packages/launches/live-state";
import { ulid } from "ulid";
import { sid } from "utils/string";

queues.launches.artefacts.save.process(async (job) => {
  const logger = createLogger("save-launch-artefacts", {
    launch: job.launch,
  });

  logger.info(`Save artefacts for node ${job.node} in launch ${job.launch}`);
  const launch = await liveState.get(job.launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  const { project, launchRequest, launchedBy } = launch;

  const outputs = await liveState.nodeOutputs(launch._id, job.node);
  if (outputs === null) {
    logger.error("Node outputs not found");
    return;
  }

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

    const plain = toPlain(artefact);
    await mongo.launchArtefacts.insertOne(plain as { _id: string });
  }
});
