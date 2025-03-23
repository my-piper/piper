import "reflect-metadata";

import { minutesToMilliseconds, secondsToMilliseconds } from "date-fns";
import { CheckPackageUpdatesJob } from "models/jobs/check-package-updates";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { RecordPipelineUsageJob } from "models/jobs/record-pipeline-usage-job";
import { SetLaunchErrorsJob } from "models/jobs/set-launch-errors-job";
import { SetLaunchOutputJob } from "models/jobs/set-launch-output-job";
import { UpdatePackageJob } from "models/jobs/update-package";
import { UpdateUserBalanceJob } from "models/jobs/update-user-balance-job";
import { RunLaunchJob } from "models/run-launch";
import { JobsQueue } from "../core-kit/services/queue";

export const queues = {
  nodes: {
    process: {
      rapid: new JobsQueue("process_rapid_nodes", ProcessNodeJob, {
        limiter: { max: 100, duration: secondsToMilliseconds(5) },
        concurrency: 50,
        timeout: secondsToMilliseconds(5),
      }),
      regular: new JobsQueue("process_regular_nodes", ProcessNodeJob, {
        limiter: { max: 200, duration: secondsToMilliseconds(15) },
        concurrency: 40,
        timeout: secondsToMilliseconds(45),
      }),
      deferred: new JobsQueue("process_deferred_nodes", ProcessNodeJob, {
        limiter: { max: 400, duration: minutesToMilliseconds(2) },
        concurrency: 20,
        timeout: minutesToMilliseconds(2),
      }),
      protracted: new JobsQueue("process_protracted_nodes", ProcessNodeJob, {
        limiter: { max: 200, duration: minutesToMilliseconds(5) },
        concurrency: 10,
        timeout: minutesToMilliseconds(5),
      }),
    },
  },
  packages: {
    checkUpdates: new JobsQueue("packages_updates", CheckPackageUpdatesJob),
    update: new JobsQueue("update_package", UpdatePackageJob),
  },
  pipelines: {
    usage: {
      record: new JobsQueue("pipelines_usage", RecordPipelineUsageJob, {
        limiter: { max: 30, duration: secondsToMilliseconds(30) },
        concurrency: 30,
      }),
    },
  },
  users: {
    updateBalance: new JobsQueue("users_update_balance", UpdateUserBalanceJob, {
      limiter: { max: 30, duration: secondsToMilliseconds(30) },
      concurrency: 30,
    }),
  },
  launches: {
    run: new JobsQueue("run_launch", RunLaunchJob, {
      limiter: { max: 30, duration: secondsToMilliseconds(30) },
      concurrency: 30,
    }),
    outputs: {
      set: new JobsQueue("set_launch_output", SetLaunchOutputJob, {
        limiter: { max: 30, duration: secondsToMilliseconds(30) },
        concurrency: 30,
      }),
    },
    errors: {
      set: new JobsQueue("set_launch_errors", SetLaunchErrorsJob, {
        limiter: { max: 30, duration: secondsToMilliseconds(30) },
        concurrency: 30,
      }),
    },
  },
};
