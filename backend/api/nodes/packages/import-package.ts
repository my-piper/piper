import api from "app/api";
import { importPackage } from "logic/node-packages";
import { checkLogged, handle } from "utils/http";

api.post(
  "/api/nodes/packages/import",
  handle(({ currentUser }) => async ({ body }) => {
    checkLogged(currentUser);

    await importPackage(body.yaml);

    return null;
  })
);
