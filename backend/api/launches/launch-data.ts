import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import * as launching from "packages/launches/launching";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:id/data",
  handle(({ currentUser }) => async ({ params: { id } }) => {
    await checkLaunchVisible(currentUser, id);

    return toPlain(await launching.data(id));
  })
);
