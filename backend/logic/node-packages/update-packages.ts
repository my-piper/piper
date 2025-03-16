import { queues } from "../../app/queue";
import { PACKAGES_UPDATES } from "../../consts/packages";
import { redis } from "../../core-kit/services/redis/redis";
import { createLogger } from "../../logger";
import { NodePackageUpdates } from "../../models/node-package";
import { loadRange } from "../../utils/redis";

const logger = createLogger("plan-update-packages");

export async function planUpdatePackages() {
  logger.info("Plan update packages");
  const packages = await loadRange(PACKAGES_UPDATES, NodePackageUpdates);
  for (const p of packages) {
    if (!!p.updated) {
      logger.info(`Plan update package ${p.current._id}`);
      await queues.packages.update.plan({ nodePackage: p.updated }, 5000);
    }
  }
  await redis.del(PACKAGES_UPDATES);
}
