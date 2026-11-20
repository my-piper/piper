import api from "app/api";
import { importPackage } from "packages/node-packages";
import { checkAdmin, handle } from "utils/http";

api.post(
  "/api/node-packages/actions/import-package",
  handle(({ currentUser }) => async ({ body: { yaml } }) => {
    checkAdmin(currentUser);

    await importPackage(yaml);

    return null;
  })
);
