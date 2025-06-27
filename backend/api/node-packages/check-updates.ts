import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import { planCheckUpdates } from "logic/node-packages";
import { getPackagesUpdateState } from "logic/node-packages/packages-update-state";
import { checkAdmin, handle } from "utils/http";

api.get(
  "/api/node-packages/check-updates",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    await planCheckUpdates();
    return toPlain(await getPackagesUpdateState());
  })
);
