import api from "app/api";
import { toInstance } from "core-kit/packages/transform";
import { Node } from "models/node";
import { generateSign } from "packages/nodes/sign-node";
import { checkEngineer, handle } from "utils/http";

api.post(
  "/api/nodes/get-sign",
  handle(({ currentUser }) => async ({ body }) => {
    checkEngineer(currentUser);

    const node = toInstance(body, Node);
    return generateSign(node);
  })
);
