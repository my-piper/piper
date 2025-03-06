import { toPlain } from "core-kit/utils/models";
import { api } from "../../app/api";
import * as launching from "../../logic/launches/launching";
import { handle } from "../../utils/http";

api.get(
  "/api/launches/:id/state",
  handle(() => async ({ params: { id } }) => {
    return toPlain(await launching.state(id));
  })
);
