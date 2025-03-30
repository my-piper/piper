import api from "app/api";
import { toPlain } from "core-kit/utils/models";
import { checkAdmin, handle } from "utils/http";
import { planCheckUpdates } from "../../../logic/node-packages";
import { getPackagesUpdateState } from "../../../logic/node-packages/packages-update-state";

api.get(
  "/api/nodes/check-packages-updates",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    await planCheckUpdates();
    return toPlain(await getPackagesUpdateState());
  })
);
