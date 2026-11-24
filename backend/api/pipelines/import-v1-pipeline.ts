import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import { importV1Pipeline } from "packages/pipelines";
import { checkAdmin, handle } from "utils/http";

api.post(
  "/api/pipelines/import/v1",
  handle(({ currentUser }) => async ({ body }) => {
    checkAdmin(currentUser);

    return toPlain(await importV1Pipeline(currentUser, body.yaml));
  })
);
