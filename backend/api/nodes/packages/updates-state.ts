import api from "app/api";
import { toPlain } from "core-kit/utils/models";
import { getPackagesUpdateState } from "../../../logic/node-packages/packages-update-state";
import { checkAdmin, handle } from "../utils/http";

api.get(
  "/api/nodes/packages-updates-state",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    return toPlain(await getPackagesUpdateState());
  })
);
