import env from "core-kit/env";
import "reflect-metadata";

import { queues } from "app/queues";
import { createLogger } from "core-kit/packages/logger";
import express from "express";

const logger = createLogger("metrics");
logger.debug("Start metrics");

const app = express();

app.get("/metrics", async (req, res) => {
  try {
    const metrics = await Promise.all([
      queues.launches.run.metrics(),
      queues.launches.outputs.set.metrics(),
      queues.launches.errors.set.metrics(),
      queues.nodes.process.rapid.metrics(),
      queues.nodes.process.regular.metrics(),
      queues.nodes.process.deferred.metrics(),
      queues.nodes.process.protracted.metrics(),
      queues.users.updateBalance.metrics(),
      queues.pipelines.usage.record.metrics(),
      queues.packages.checkUpdates.metrics(),
      queues.packages.update.metrics(),
    ]);
    const metricsData = metrics.join("\n");
    res.set("Content-Type", "text/plain");
    res.send(metricsData);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT =
  (() => {
    const port = env["METRICS_PORT"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 80;

app.listen(PORT, () => {
  logger.debug("Server is running");
});
