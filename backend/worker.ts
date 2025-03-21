import "core-kit/env";
import "reflect-metadata";

import { RELOAD_WORKER_CHANNEL } from "consts/signals";
import { createLogger } from "core-kit/services/logger";
import { redis } from "core-kit/services/redis";
import "./app/io";
import { queues } from "./app/queue";
import { streams } from "./app/stream";

const logger = createLogger("worker");
logger.info("Start worker");

import { secondsToMilliseconds } from "date-fns";
import "./jobs/check-package-updates";
import "./jobs/process-node";
import "./jobs/record-pipeline-usage";
import "./jobs/run-launch";
import "./jobs/set-launch-errors";
import "./jobs/set-launch-output";
import "./jobs/update-package";
import "./jobs/update-user-balance";

await streams.pipeline.messages.connect();
await streams.pipeline.metrics.outputs.connect();
await streams.pipeline.metrics.finished.connect();
await streams.pipeline.usage.connect();

let EXIT_CODE = 0;

const subscriber = redis.duplicate();
await subscriber.connect();
await subscriber.subscribe(RELOAD_WORKER_CHANNEL, () => {
  logger.info("Received signal to reboot");
  EXIT_CODE = 123;
  const timeout = Math.round(Math.random() * 30) + 5;
  logger.info(`Exiting in ${timeout}s`);
  setTimeout(
    () => process.kill(process.pid, "SIGINT"),
    secondsToMilliseconds(timeout)
  );
});

logger.info("Worker is ready");

process.on("SIGINT", async (signal) => {
  logger.info(`Our process ${process.pid} has been interrupted ${signal}`);
  await shutdown();
});

process.on("SIGTERM", async (signal) => {
  logger.info(`Our process ${process.pid} received a SIGTERM signal ${signal}`);
  await shutdown();
});

let shutting = false;
const GRACEFUL_SHUTDOWN_TIMEOUT = 120;

async function shutdown() {
  if (shutting) {
    return;
  }
  shutting = true;
  logger.debug(`Graceful shutdown in ${GRACEFUL_SHUTDOWN_TIMEOUT}s`);
  setTimeout(() => {
    logger.warn("Couldn't close queues, hardcore exiting");
    process.exit(1);
  }, secondsToMilliseconds(GRACEFUL_SHUTDOWN_TIMEOUT));

  await Promise.all([
    queues.nodes.process.rapid.close(),
    queues.nodes.process.regular.close(),
    queues.nodes.process.deferred.close(),
    queues.nodes.process.protracted.close(),
    queues.launches.run.close(),
    queues.launches.outputs.set.close(),
    queues.launches.errors.set.close(),
    queues.users.updateBalance.close(),
  ]).then(() => logger.info("Queues are closed"));

  logger.info("See you 😘");
  process.exit(EXIT_CODE);
}
