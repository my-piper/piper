import api from "app/api";
import { importPackage } from "packages/node-packages";
import { checkLogged, handle } from "utils/http";

api.post(
  "/api/node-packages/actions/import-package",
  handle(({ currentUser }) => async ({ body: { yaml } }) => {
    checkLogged(currentUser);

    await importPackage(yaml);

    return null;
  })
);
