import { queues } from "app/queues";
import { createLogger } from "core-kit/packages/logger";
import { DelayedError } from "core-kit/packages/queue";
import { kick } from "packages/launches";
import { liveState } from "packages/launches/live-state";
import { turnInScope } from "packages/launches/scope";
import { RunLaunchJobResult } from "types/launch";

queues.launches.run.process(async (runJob, job) => {
  const logger = createLogger("run-launch", {
    launch: runJob.launch,
  });

  logger.info("Check if pipeline can run");

  await liveState.beat(runJob.launch);

  const wait = await turnInScope(runJob.launch, runJob.scope);
  if (wait > 0) {
    logger.debug("Continue wait in scope queue");
    await job.moveToDelayed(Date.now() + wait, job.token);
    throw new DelayedError();
  }

  logger.info("Pipeline can run");

  const launch = await liveState.get(runJob.launch);
  if (!launch) {
    logger.error("Launch is not found");
    return RunLaunchJobResult.LAUNCH_NOT_FOUND;
  }

  await kick(launch);
  return RunLaunchJobResult.RUN_LAUNCH;
});
