import { createLogger } from "core-kit/packages/logger";
import { planCheckUpdates } from "packages/node-packages";

const logger = createLogger("check-packages-updates");

export async function checkPackagesUpdates() {
  logger.info("Check packages updates");
  await planCheckUpdates();
}
