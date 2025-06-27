import api from "app/api";
import { importPackage } from "logic/node-packages";
import { checkLogged, handle } from "utils/http";

api.post(
  "/api/node-packages/import",
  handle(({ currentUser }) => async ({ body: { yaml } }) => {
    checkLogged(currentUser);

    await importPackage(yaml);

    return null;
  })
);
