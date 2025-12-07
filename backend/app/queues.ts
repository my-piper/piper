import { JobsQueue } from "core-kit/packages/queue";
import { minutesToMilliseconds, secondsToMilliseconds } from "date-fns";
import { CheckPackageUpdatesJob } from "models/jobs/check-package-updates";
import { ProcessNodeJob } from "models/jobs/process-node-job";
import { RecordPipelineUsageJob } from "models/jobs/record-pipeline-usage-job";
import { SaveNodeArtefactsJob } from "models/jobs/save-node-artefact";
import { SetLaunchErrorsJob } from "models/jobs/set-launch-errors-job";
import { SetLaunchInputsJob } from "models/jobs/set-launch-inputs-job";
import { SetLaunchOutputJob } from "models/jobs/set-launch-output-job";
import { UpdatePackageJob } from "models/jobs/update-package";
import { UpdateUserBalanceJob } from "models/jobs/update-user-balance-job";
import { RunLaunchJob } from "models/run-launch";

export const queues = {
  nodes: {
    process: {
      rapid: new JobsQueue("process_rapid_nodes", ProcessNodeJob, {
        limiter: { max: 1000, duration: secondsToMilliseconds(5) },
        concurrency: 50,
        timeout: secondsToMilliseconds(5),
      }),
      regular: new JobsQueue("process_regular_nodes", ProcessNodeJob, {
        limiter: { max: 1000, duration: secondsToMilliseconds(5) },
        concurrency: 40,
        timeout: secondsToMilliseconds(45),
      }),
      deferred: new JobsQueue("process_deferred_nodes", ProcessNodeJob, {
        limiter: { max: 400, duration: minutesToMilliseconds(2) },
        concurrency: 20,
        timeout: minutesToMilliseconds(2),
      }),
      protracted: new JobsQueue("process_protracted_nodes", ProcessNodeJob, {
        limiter: { max: 200, duration: minutesToMilliseconds(3) },
        concurrency: 30,
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
      limiter: { max: 1000, duration: secondsToMilliseconds(10) },
      concurrency: 30,
    }),
    inputs: {
      set: new JobsQueue("set_launch_inputs", SetLaunchInputsJob, {
        limiter: { max: 100, duration: secondsToMilliseconds(10) },
        concurrency: 50,
      }),
    },
    artefacts: {
      save: new JobsQueue("save_node_artefacts", SaveNodeArtefactsJob, {
        limiter: { max: 100, duration: secondsToMilliseconds(10) },
        concurrency: 50,
      }),
    },
    outputs: {
      set: new JobsQueue("set_launch_output", SetLaunchOutputJob, {
        limiter: { max: 100, duration: secondsToMilliseconds(10) },
        concurrency: 50,
      }),
    },
    errors: {
      set: new JobsQueue("set_launch_errors", SetLaunchErrorsJob, {
        limiter: { max: 100, duration: secondsToMilliseconds(10) },
        concurrency: 50,
      }),
    },
  },
};
