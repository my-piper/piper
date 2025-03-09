import subDays from "date-fns/subDays";
import mongo from "../app/mongo";
import { createLogger } from "../logger";

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
  mongo.launches.deleteMany({
    launchedAt: { $lt: subDays(new Date(), MAX_STORE_LAUNCH_DAYS) },
  });
}
