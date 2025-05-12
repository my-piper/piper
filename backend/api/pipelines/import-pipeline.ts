import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import { importPipeline } from "logic/pipelines";
import { checkLogged, handle } from "utils/http";

api.post(
  "/api/pipelines/import",
  handle(({ currentUser }) => async ({ body }) => {
    checkLogged(currentUser);

    return toPlain(await importPipeline(currentUser, body.yaml));
  })
);
