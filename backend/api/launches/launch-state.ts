import api from "app/api";
import { toPlain } from "core-kit/utils/models";
import { handle } from "utils/http";
import * as launching from "../../logic/launches/launching";

api.get(
  "/api/launches/:id/state",
  handle(() => async ({ params: { id } }) => {
    return toPlain(await launching.state(id));
  })
);
