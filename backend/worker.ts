import "core-kit/env";
import "reflect-metadata";

import cluster, { Worker } from "cluster";
import { RELOAD_WORKER_CHANNEL } from "consts/signals";
import { createLogger } from "core-kit/services/logger";
import { JobsQueue } from "core-kit/services/queue";
import { redis } from "core-kit/services/redis";
import { FatalError } from "core-kit/types/errors";
import { secondsToMilliseconds } from "date-fns";
import { queues } from "./app/queue";
import { streams } from "./app/stream";

type WorkerMessage = {
  id: string;
};

await streams.pipeline.messages.connect();
await streams.pipeline.metrics.outputs.connect();
await streams.pipeline.metrics.finished.connect();
await streams.pipeline.usage.connect();

const WORKERS: {
  [key: string]: { queue: JobsQueue<unknown>; loader: () => Promise<unknown> };
} = {
  process_rapid_nodes: {
    queue: queues.nodes.process.rapid,
    loader: () => import("./jobs/process-node/process-rapid-nodes"),
  },
  process_regular_nodes: {
    queue: queues.nodes.process.regular,
    loader: () => import("./jobs/process-node/process-regular-nodes"),
  },
  process_deferred_nodes: {
    queue: queues.nodes.process.deferred,
    loader: () => import("./jobs/process-node/process-deferred-nodes"),
  },
  process_protracted_nodes: {
    queue: queues.nodes.process.protracted,
    loader: () => import("./jobs/process-node/process-protracted-nodes"),
  },
  launches_run: {
    queue: queues.launches.run,
    loader: () => import("./jobs/run-launch"),
  },
  launches_outputs_set: {
    queue: queues.launches.outputs.set,
    loader: () => import("./jobs/set-launch-output"),
  },
  launches_errors_set: {
    queue: queues.launches.errors.set,
    loader: () => import("./jobs/set-launch-errors"),
  },
  users_update_balance: {
    queue: queues.users.updateBalance,
    loader: () => import("./jobs/update-user-balance"),
  },
  pipelines_usages: {
    queue: queues.pipelines.usages,
    loader: () => import("./jobs/record-pipeline-usage"),
  },
  packages_check_updates: {
    queue: queues.packages.checkUpdates,
    loader: () => import("./jobs/check-package-updates"),
  },
  packages_update: {
    queue: queues.packages.update,
    loader: () => import("./jobs/update-package"),
  },
};

if (cluster.isPrimary) {
  const logger = createLogger("cluster");

  const forks = new Map<string, Worker>();
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
        for (const [id, worker] of forks) {
          promises.push(
            new Promise<void>((resolve) => {
              worker.on("exit", (code: number, signal: string) => {
                logger.info(
                  `Worker ${id} exited with code ${code}, signal ${signal || "?"}`
                );
                resolve();
              });
              logger.info(`Exit from worker ${id}`);
              worker.process.kill("SIGTERM");
            })
          );
        }
        return promises;
      })()
    );

    logger.info("Cluster stopped 😘");
    process.exit(EXIT_CODE);
  };

  process.on("SIGINT", async (signal) => {
    logger.info(
      `Our process ${process.pid} has been interrupted ${signal || "?"}`
    );
    await shutdown();
  });

  process.on("SIGTERM", async (signal) => {
    logger.info(
      `Our process ${process.pid} received a SIGTERM signal ${signal || "?"}`
    );
    await shutdown();
  });

  logger.info("Start cluster");

  let EXIT_CODE = 0;
  const subscriber = redis.duplicate();
  await subscriber.connect();
  await subscriber.subscribe(RELOAD_WORKER_CHANNEL, () => {
    logger.info("Received signal to reboot");
    EXIT_CODE = 123;
    const timeout = Math.round(Math.random() * 30) + 5;
    logger.info(`Exiting in ${timeout}s`);
    setTimeout(() => shutdown(), secondsToMilliseconds(timeout));
  });

  const createWorker = (id: string) => {
    const worker = cluster.fork({ WORKER_ID: id });
    logger.info(`Forked process for ${id} with PID ${worker.process.pid}`);
    worker.on("exit", (code: number, signal: string) => {
      if (shutting) {
        return;
      }
      if (worker.exitedAfterDisconnect) {
        logger.info(`Worker ${worker.process.pid} exited`);
        forks.delete(id);
      } else {
        logger.error(
          `Worker ${id} crashed with code ${code || "?"} & signal ${signal || "?"}`
        );
        createWorker(id);
      }
    });
    forks.set(id, worker);
  };

  for (let id of Object.keys(WORKERS)) {
    createWorker(id);
  }

  logger.info(`Cluster is ready with PID ${process.pid}`);
} else {
  const id = process.env["WORKER_ID"];
  if (!id) {
    throw new FatalError("Please, set worker id");
  }
  const queue = WORKERS[id];
  if (!queue) {
    throw new FatalError(`Unknown worker id ${queue}`);
  }

  const logger = createLogger(id);

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

    await queue.queue.close();
    logger.info("Queues are closed");

    await redis.disconnect();

    logger.info(`Worker ${id} stopped 😘`);
    process.exit(0);
  };

  process.on("SIGINT", async (signal) => {
    logger.info(`Our process ${process.pid} has been interrupted ${signal}`);
    await shutdown();
  });

  process.on("SIGTERM", async (signal) => {
    logger.info(
      `Our process ${process.pid} received a SIGTERM signal ${signal}`
    );
    await shutdown();
  });

  logger.info(`Start worker ${id}`);
  await queue.loader();
}
