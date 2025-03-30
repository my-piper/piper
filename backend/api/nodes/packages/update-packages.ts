import api from "app/api";
import { toPlain } from "core-kit/utils/models";
import { planUpdatePackages } from "../../../logic/node-packages";
import { getPackagesUpdateState } from "../../../logic/node-packages/packages-update-state";
import { checkAdmin, handle } from "../utils/http";

api.get(
  "/api/nodes/update-packages",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    await planUpdatePackages();
    return toPlain(await getPackagesUpdateState());
  })
);
