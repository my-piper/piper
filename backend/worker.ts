import "reflect-metadata";

import { Command } from "commander";
import { RELOAD_WORKER_CHANNEL } from "consts/signals";
import { createLogger } from "core-kit/services/logger";
import { JobsQueue } from "core-kit/services/queue";
import redis from "core-kit/services/redis";
import sentry from "core-kit/services/sentry";
import { FatalError } from "core-kit/types/errors";
import { secondsToMilliseconds } from "date-fns";
import express from "express";
import { Server } from "http";
import { queues } from "./app/queues";
import { streams } from "./app/streams";

type Queue = {
  queue: JobsQueue<unknown>;
  loader: () => Promise<unknown>;
};

type Worker = {
  queues: Map<string, Queue>;
};

const Workers = new Map<string, Worker>([
  [
    "process_rapid_nodes",
    {
      queues: new Map([
        [
          "process_rapid_nodes",
          {
            queue: queues.nodes.process.rapid,
            loader: () => import("./jobs/process-node/process-rapid-nodes"),
          },
        ],
      ]),
    },
  ],
  [
    "process_regular_nodes",
    {
      queues: new Map([
        [
          "process_regular_nodes",
          {
            queue: queues.nodes.process.regular,
            loader: () => import("./jobs/process-node/process-regular-nodes"),
          },
        ],
      ]),
    },
  ],
  [
    "process_deferred_nodes",
    {
      queues: new Map([
        [
          "process_deferred_nodes",
          {
            queue: queues.nodes.process.deferred,
            loader: () => import("./jobs/process-node/process-deferred-nodes"),
          },
        ],
      ]),
    },
  ],
  [
    "process_protracted_nodes",
    {
      queues: new Map([
        [
          "process_protracted_nodes",
          {
            queue: queues.nodes.process.protracted,
            loader: () =>
              import("./jobs/process-node/process-protracted-nodes"),
          },
        ],
      ]),
    },
  ],
  [
    "run_launches",
    {
      queues: new Map([
        [
          "run_launches",
          {
            queue: queues.launches.run,
            loader: () => import("./jobs/run-launch"),
          },
        ],
      ]),
    },
  ],
  [
    "set_launches_io",
    {
      queues: new Map([
        [
          "set_launch_inputs",
          {
            queue: queues.launches.inputs.set,
            loader: () => import("./jobs/set-launch-inputs"),
          },
        ],
        [
          "set_launch_output",
          {
            queue: queues.launches.outputs.set,
            loader: () => import("./jobs/set-launch-output"),
          },
        ],
      ]),
    },
  ],
  [
    "set_launches_errors",
    {
      queues: new Map([
        [
          "set_launches_errors",
          {
            queue: queues.launches.errors.set,
            loader: () => import("./jobs/set-launch-errors"),
          },
        ],
      ]),
    },
  ],
  [
    "update_users_balance",
    {
      queues: new Map([
        [
          "update_users_balance",
          {
            queue: queues.users.updateBalance,
            loader: () => import("./jobs/update-user-balance"),
          },
        ],
      ]),
    },
  ],
  [
    "record_pipelines_usage",
    {
      queues: new Map([
        [
          "record_pipelines_usage",
          {
            queue: queues.pipelines.usage.record,
            loader: () => import("./jobs/record-pipeline-usage"),
          },
        ],
      ]),
    },
  ],
  [
    "update_packages",
    {
      queues: new Map([
        [
          "check_updates",
          {
            queue: queues.packages.checkUpdates,
            loader: () => import("./jobs/check-package-updates"),
          },
        ],
        [
          "update_packages",
          {
            queue: queues.packages.update,
            loader: () => import("./jobs/update-package"),
          },
        ],
      ]),
    },
  ],
]);

const logger = createLogger("worker");

await streams.pipeline.messages.connect();
await streams.pipeline.metrics.outputs.connect();
await streams.pipeline.metrics.finished.connect();
await streams.pipeline.usage.connect();

const program = new Command();
program
  .option("-w, --workers <items...>")
  .option("-h, --health")
  .option("-i, --reboot")
  .parse(process.argv);

const options = program.opts<{
  workers: string[];
  reboot: boolean;
  health: boolean;
}>();
const workers = options.workers || Workers.keys();

const processing = new Map<string, Queue>();
for (const id of workers) {
  const worker = Workers.get(id);
  if (!worker) {
    throw new FatalError(`Worker ${id} not found`);
  }

  for (const [id, queue] of worker.queues) {
    logger.info(`Start processing queue: ${id}`);
    await queue.loader();
    processing.set(id, queue);
  }
}

let health: Server | null = null;
let EXIT_CODE = 0;
let shutting = false;
const GRACEFUL_SHUTDOWN_TIMEOUT = 120;

const shutdown = async () => {
  if (shutting) {
    return;
  }
  shutting = true;
  logger.debug(`Graceful shutdown in ${GRACEFUL_SHUTDOWN_TIMEOUT}s`);
  setTimeout(() => {
    logger.warn("Couldn't close queues, hardcore exiting");
    process.exit(1);
  }, secondsToMilliseconds(GRACEFUL_SHUTDOWN_TIMEOUT));

  await Promise.all(
    (() => {
      const promises = [];
      for (const [id, queue] of processing) {
        logger.info(`Closing queue ${id}`);
        promises.push(queue.queue.close());
      }
      return promises;
    })()
  );
  logger.info("Queues are closed");

  await redis.disconnect();

  if (!!health) {
    await new Promise<void>((resolve, reject) => {
      health.close((err) => {
        if (!!err) {
          reject(err);
        } else {
          logger.info("Health check has stopped");
          resolve();
        }
      });
    });
  }
  logger.info(`Worker stopped! See ya on the flip side! 😉😘`);
  process.exit(EXIT_CODE);
};

if (options.reboot) {
  logger.info("Reboot activated");
  const subscriber = redis.duplicate();
  await subscriber.connect();
  await subscriber.subscribe(RELOAD_WORKER_CHANNEL, () => {
    logger.info("Received signal to reboot");
    EXIT_CODE = 123;
    const timeout = Math.round(Math.random() * 30) + 5;
    logger.info(`Rebooting in ${timeout}s`);
    setTimeout(() => shutdown(), secondsToMilliseconds(timeout));
  });
}

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception");
  logger.error(error);
  sentry.captureException(error);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection");
  logger.error(reason);
  sentry.captureException(reason);
});

process.on("SIGINT", async (signal) => {
  logger.info(`Our process ${process.pid} has been interrupted ${signal}`);
  await shutdown();
});

process.on("SIGTERM", async (signal) => {
  logger.info(`Our process ${process.pid} received a SIGTERM signal ${signal}`);
  await shutdown();
});

logger.info("Worker is running");

if (options.health) {
  const app = express();
  app.get("/health", (req, res) => {
    res.status(200).send("I am alive 😘");
  });
  const PORT =
    (() => {
      const port = process.env["WORKER_PORT"];
      if (!!port) {
        return parseInt(port);
      }
      return 0;
    })() || 80;

  health = app.listen(PORT, () => logger.info("Health check is running"));
}
