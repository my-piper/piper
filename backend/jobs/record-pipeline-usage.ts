import { queues } from "app/queues";
import { streams } from "app/streams";
import { createLogger } from "core-kit/packages/logger";
import { ulid } from "ulid";

const UPDATE_BALANCE_DELAY = 5000;

queues.pipelines.usage.record.process(async (recordUsageJob) => {
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
