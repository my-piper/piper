import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { Job } from "core-kit/packages/queue";
import { mapTo } from "core-kit/packages/transform";
import { LAUNCH_ROOM } from "consts/rooms";
import { PipelineEvent } from "models/events";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { liveState } from "packages/launches/live-state";
import { PipelineEventType } from "types/pipeline";
import { applyFailure } from "./apply-outcome";

export default async (nodeJob: ProcessNodeJob, err: Error, job: Job) => {
  const logger = createLogger("process-node", {
    launch: nodeJob.launch,
    node: nodeJob.node,
  });

  const launch = await liveState.get(nodeJob.launch);
  if (!launch) {
    logger.error("Launch is not found");
    return;
  }

  const notifyNode = (node: string, event: PipelineEventType) => {
    notify(
      LAUNCH_ROOM(launch._id),
      event,
      mapTo({ launch: launch._id, node }, PipelineEvent)
    );
  };

  await applyFailure({ launch, node: nodeJob.node, job }, err, {
    logger,
    notify: { node: notifyNode },
  });
};
