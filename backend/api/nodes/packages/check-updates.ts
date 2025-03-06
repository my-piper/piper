import { toPlain } from "core-kit/utils/models";
import { api } from "../../../app/api";
import { planCheckUpdates } from "../../../logic/node-packages";
import { getPackagesUpdateState } from "../../../logic/node-packages/packages-update-state";
import { checkAdmin, handle } from "../../../utils/http";

api.get(
  "/api/nodes/check-packages-updates",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    await planCheckUpdates();
    return toPlain(await getPackagesUpdateState());
  })
);
