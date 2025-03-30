import api from "app/api";
import { toPlain } from "core-kit/utils/models";
import { checkAdmin, handle } from "utils/http";
import { getPackagesUpdateState } from "../../../logic/node-packages/packages-update-state";

api.get(
  "/api/nodes/packages-updates-state",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    return toPlain(await getPackagesUpdateState());
  })
);
