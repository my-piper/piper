import api from "app/api";
import { createLogger } from "core-kit/packages/logger";
import { toPlain } from "core-kit/packages/transform";
import { planCheckUpdates } from "logic/node-packages";
import { getPackagesUpdateState } from "logic/node-packages/packages-update-state";
import { checkAdmin, handle } from "utils/http";

const logger = createLogger("check-updates");

api.post(
  "/api/node-packages/updates/check",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    logger.info("Check updates");

    await planCheckUpdates();
    return toPlain(await getPackagesUpdateState());
  })
);
