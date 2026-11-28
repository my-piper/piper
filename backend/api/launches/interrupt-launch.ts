import api from "app/api";
import { NotFoundError } from "core-kit/types/errors";
import { interrupt } from "packages/launches/launching";
import { liveState } from "packages/launches/live-state";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.post(
  "/api/launches/:id/interrupt",
  handle(({ currentUser }) => async ({ params: { id } }) => {
    await checkLaunchVisible(currentUser, id);

    if (!(await liveState.exists(id))) {
      throw new NotFoundError();
    }

    await interrupt(id);
    return null;
  })
);
