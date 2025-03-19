import "core-kit/env";
import "reflect-metadata";

import bottleneck from "bottleneck";
import sentry from "core-kit/services/sentry";
import { NODE_ENV } from "./consts/core";
import { createLogger } from "./logger";
import { checkPackagesUpdates } from "./periodic/check-packages-updates";
import { cleanLaunches } from "./periodic/clear-launches";
import { clearShare } from "./periodic/clear-share";

const logger = createLogger("periodic");

function everyMin(mins: number) {
  return mins * 60 * 1000;
}

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
