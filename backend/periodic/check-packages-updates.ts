import { createLogger } from "core-kit/services/logger";
import { planCheckUpdates } from "../logic/node-packages";

const logger = createLogger("check-packages-updates");

export async function checkPackagesUpdates() {
  logger.info("Check packages updates");
  await planCheckUpdates();
}
