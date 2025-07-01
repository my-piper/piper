import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import * as launching from "packages/launches/launching";
import { handle } from "utils/http";

api.get(
  "/api/launches/:id/data",
  handle(() => async ({ params: { id } }) => {
    return toPlain(await launching.data(id));
  })
);
