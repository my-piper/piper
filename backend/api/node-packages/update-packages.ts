import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import { planUpdatePackages } from "logic/node-packages";
import { getPackagesUpdateState } from "logic/node-packages/packages-update-state";
import { checkAdmin, handle } from "utils/http";

api.post(
  "/api/node-packages/updates/apply",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    await planUpdatePackages();
    return toPlain(await getPackagesUpdateState());
  })
);
