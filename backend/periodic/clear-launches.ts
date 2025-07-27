import mongo from "app/mongo";
import { createLogger } from "core-kit/packages/logger";
import subDays from "date-fns/subDays";

const MAX_STORE_LAUNCH_DAYS = (() => {
  const value = process.env["MAX_STORE_LAUNCH_DAYS"];
  if (!!value) {
    return parseInt(value);
  }
  return 7;
})();

const logger = createLogger("clear-launches");

export async function cleanLaunches() {
  logger.info("Clear launches");
  await mongo.launches.deleteMany({
    launchedAt: { $lt: subDays(new Date(), MAX_STORE_LAUNCH_DAYS) },
  });
  await mongo.launchOutputs.deleteMany({
    filledAt: { $lt: subDays(new Date(), MAX_STORE_LAUNCH_DAYS) },
  });
}
