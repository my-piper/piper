import mongo from "app/mongo";
import { queues } from "app/queues";
import { PACKAGES_UPDATES } from "consts/packages";
import { createLogger } from "core-kit/packages/logger";
import redis from "core-kit/packages/redis";
import { DataError } from "core-kit/types/errors";
import { NodePackage } from "models/node-package";
import { toModels } from "utils/http";

const logger = createLogger("plan-check-packages-updates");

export async function planCheckUpdates() {
  logger.info("Load packages");

  const { planned } = await queues.packages.checkUpdates.getState();
  if (planned > 0) {
    throw new DataError("Updates planned already");
  }

  await redis.del(PACKAGES_UPDATES);

  for (const { _id, url } of toModels(
    await mongo.nodePackages
      .find({}, { projection: { _id: 1, url: 1 } })
      .toArray(),
    NodePackage
  )) {
    if (!url) {
      logger.info(`Package ${_id} has no url to update`);
      continue;
    }
    logger.info(`Plan package ${_id} to check update`);
    await queues.packages.checkUpdates.plan({ nodePackage: _id }, 2000);
  }
}
