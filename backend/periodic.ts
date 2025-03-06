import bottleneck from "bottleneck";
import express, { Request, Response } from "express";
import "reflect-metadata";
import "./app/io";
import { JobsQueue, queues } from "./app/queue";
import { METRICS_PORT, NODE_ENV } from "./consts/core";
import "./jobs/check-package-updates";
import "./jobs/process-node";
import "./jobs/run-launch";
import "./jobs/set-launch-errors";
import "./jobs/set-launch-output";
import "./jobs/update-package";
import { createLogger } from "./logger";
import { metrics, registry } from "./metrics";
import { checkPackagesUpdates } from "./periodic/check-packages-updates";
import { cleanLaunches } from "./periodic/clear-launches";
import { clearShare } from "./periodic/clear-share";
import sentry from "./sentry";

const logger = createLogger("periodic");

const QUEUES_CLEANUP_INTERVAL = 60 * 5 * 1000;

async function cleanQueues() {
  logger.info("Cleanup queues");

  await queues.nodes.clean();
  await queues.launches.run.clean();
  await queues.launches.outputs.set.clean();
  await queues.launches.errors.set.clean();
  await queues.packages.checkUpdates.clean();
  await queues.packages.update.clean();

  logger.info("Done");

  setTimeout(cleanQueues, QUEUES_CLEANUP_INTERVAL);
}

setTimeout(cleanQueues, Math.ceil(Math.random() * QUEUES_CLEANUP_INTERVAL));

const METRICS_COLLECT_INTERVAL = 5000;

{
  const queueMetrics = async <T, Y>(name: string, queue: JobsQueue<T, Y>) => {
    const { active, waiting, completed, failed, delayed } =
      await queue.getState();
    metrics.queue.active.set({ queue: name }, active);
    metrics.queue.waiting.set({ queue: name }, waiting);
    metrics.queue.completed.set({ queue: name }, completed);
    metrics.queue.failed.set({ queue: name }, failed);
    metrics.queue.delayed.set({ queue: name }, delayed);
  };

  const snapMetrics = async () => {
    await queueMetrics("nodes", queues.nodes);
    await queueMetrics("launches-run", queues.launches.run);
    await queueMetrics("set-launches-outputs", queues.launches.outputs.set);
    await queueMetrics("check-package-updates", queues.packages.checkUpdates);

    setTimeout(snapMetrics, METRICS_COLLECT_INTERVAL);
  };

  await snapMetrics();

  const server = express();
  server.use("/metrics", async (req: Request, res: Response) => {
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

  server.listen(METRICS_PORT, () => {
    logger.debug("Metrics is running");
  });
}

function everyMin(mins: number) {
  return mins * 60 * 1000;
}

// await loadPipelines();

function schedule(task: () => Promise<void>, interval: number) {
  const limiter = new bottleneck({
    maxConcurrent: 1,
    minTime: interval,
  });

  const queue = () => {
    limiter.schedule(task).catch((e) => {
      if (NODE_ENV === "production") {
        sentry.captureException(e, { tags: { envMode: "prod" } });
      }
      logger.error(e);
    });
  };

  setTimeout(() => {
    setInterval(async () => {
      if ((await limiter.running()) <= 5) {
        queue();
      }
    }, interval);
  }, Math.random() * 30000);
}

schedule(clearShare, everyMin(1));
schedule(cleanLaunches, everyMin(5));
schedule(checkPackagesUpdates, everyMin(5));
