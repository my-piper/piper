import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import * as launching from "logic/launches/launching";
import { handle } from "utils/http";

api.get(
  "/api/launches/:id/state",
  handle(() => async ({ params: { id } }) => {
    return toPlain(await launching.state(id));
  })
);
