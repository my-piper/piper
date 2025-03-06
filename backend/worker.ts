import "core-kit/env";
import "reflect-metadata";

import { createLogger } from "core-kit/services/logger";
import "./app/io";
import { queues } from "./app/queue";
import { streams } from "./app/stream";
import "./jobs/check-package-updates";
import "./jobs/process-node";
import "./jobs/record-pipeline-usage";
import "./jobs/run-launch";
import "./jobs/set-launch-errors";
import "./jobs/set-launch-output";
import "./jobs/update-package";
import "./jobs/update-user-balance";

const logger = createLogger("worker");
logger.debug("Start worker");

await streams.pipeline.messages.connect();
await streams.pipeline.metrics.outputs.connect();
await streams.pipeline.metrics.finished.connect();
await streams.pipeline.usage.connect();

process.on("SIGINT", async (signal) => {
  logger.info(`Our process ${process.pid} has been interrupted ${signal}`);
  await shutdown();
});

process.on("SIGTERM", async (signal) => {
  logger.info(`Our process ${process.pid} received a SIGTERM signal ${signal}`);
  await shutdown();
});

let shutting = false;

async function shutdown() {
  if (shutting) {
    return;
  }
  shutting = true;
  logger.debug("Graceful shutdown");
  setTimeout(
    () => {
      logger.warn("Couldn't close all queues within 120s, exiting.");
      process.exit(1);
    },
    2 * 60 * 1000
  );

  await Promise.all([
    queues.nodes.close(),
    queues.launches.run.close(),
    queues.launches.outputs.set.close(),
  ]).then(() => console.log("Queues are closed"));

  logger.info("See you 😘");
  process.exit(0);
}
