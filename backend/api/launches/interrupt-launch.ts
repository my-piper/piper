import api from "app/api";
import { LAUNCH } from "consts/redis";
import { exists } from "core-kit/packages/redis";
import { NotFoundError } from "core-kit/types/errors";
import { interrupt } from "packages/launches/launching";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.post(
  "/api/launches/:id/interrupt",
  handle(({ currentUser }) => async ({ params: { id } }) => {
    await checkLaunchVisible(currentUser, id);

    if (!(await exists(LAUNCH(id)))) {
      throw new NotFoundError();
    }

    await interrupt(id);
    return null;
  })
);
