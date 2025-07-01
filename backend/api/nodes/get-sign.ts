import api from "app/api";
import { generateSign } from "packages/nodes/sign-node";
import { checkEngineer, handle } from "utils/http";

api.post(
  "/api/nodes/get-sign",
  handle(({ currentUser }) => async ({ body }) => {
    checkEngineer(currentUser);
    return generateSign(body);
  })
);
