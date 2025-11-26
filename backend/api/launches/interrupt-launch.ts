import api from "app/api";
import { LAUNCH, LAUNCH_EXPIRED, LAUNCH_INTERRUPTED } from "consts/redis";
import { exists, setValue } from "core-kit/packages/redis";
import { NotFoundError } from "core-kit/types/errors";
import { checkLogged, handle } from "utils/http";

api.post(
  "/api/launches/:id/interrupt",
  handle(({ currentUser }) => async ({ params: { id } }) => {
    checkLogged(currentUser);

    if (!(await exists(LAUNCH(id)))) {
      throw new NotFoundError();
    }

    await setValue(
      LAUNCH_INTERRUPTED(id),
      new Date().toISOString(),
      LAUNCH_EXPIRED
    );
    return null;
  })
);
