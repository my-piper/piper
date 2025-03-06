import "reflect-metadata";

import { minutesToMilliseconds } from "date-fns";
import { CheckPackageUpdatesJob } from "models/jobs/check-package-updates";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { RecordPipelineUsageJob } from "models/jobs/record-pipeline-usage-job";
import { SetLaunchErrorsJob } from "models/jobs/set-launch-errors-job";
import { SetLaunchOutputJob } from "models/jobs/set-launch-output-job";
import { UpdatePackageJob } from "models/jobs/update-package";
import { UpdateUserBalanceJob } from "models/jobs/update-user-balance-job";
import { RunLaunchJob } from "models/run-launch";
import { JobsQueue } from "../core-kit/services/queues";

export const queues = {
  nodes: new JobsQueue("process_nodes", ProcessNodeJob, {
    limiter: { max: 30, duration: minutesToMilliseconds(5) },
    concurrency: 30,
  }),
  packages: {
    checkUpdates: new JobsQueue("packages_updates", CheckPackageUpdatesJob),
    update: new JobsQueue("update_package", UpdatePackageJob),
  },
  pipelines: {
    usages: new JobsQueue("pipelines_usage", RecordPipelineUsageJob),
  },
  users: {
    updateBalance: new JobsQueue("users_update_balance", UpdateUserBalanceJob),
  },
  launches: {
    run: new JobsQueue("run_launch", RunLaunchJob),
    outputs: {
      set: new JobsQueue("set_launch_output", SetLaunchOutputJob),
    },
    errors: {
      set: new JobsQueue("set_launch_errors", SetLaunchErrorsJob),
    },
  },
};
