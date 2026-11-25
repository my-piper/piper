import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import { importPipeline } from "packages/pipelines";
import { checkAdmin, handle } from "utils/http";

api.post(
  "/api/pipelines/import",
  handle(({ currentUser }) => async ({ body }) => {
    checkAdmin(currentUser);

    return toPlain(
      await importPipeline(currentUser, body.yaml)
    );
  })
);
