import { createLogger } from "core-kit/services/logger";
import { ulid } from "ulid";
import { queues } from "../app/queue";
import { streams } from "../app/stream";

const UPDATE_BALANCE_DELAY = 5000;

queues.pipelines.usages.process(async (recordUsageJob) => {
  const { project, pipeline, launch, launchedBy, node, processedAt, costs } =
    recordUsageJob;
  const logger = createLogger("record-pipeline-usage", { launch });
  logger.info(`Record usage for ${node} in launch ${launch}`);

  await streams.pipeline.usage.send({
    project,
    pipeline,
    launch,
    launchedBy,
    node,
    processedAt,
    costs,
    cursor: ulid(),
  });

  await queues.users.updateBalance.plan(
    { user: launchedBy },
    { delay: UPDATE_BALANCE_DELAY }
  );
});
