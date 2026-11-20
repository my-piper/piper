import api from "app/api";
import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { Node } from "models/node";
import { prepareScriptSource } from "packages/nodes/script-source";
import { generateSign } from "packages/nodes/sign-node";
import { checkEngineer, handle } from "utils/http";

api.post(
  "/api/nodes/prepare-script",
  handle(({ currentUser }) => async ({ body }) => {
    checkEngineer(currentUser);
    if (
      typeof body.node?.script !== "string" ||
      (body.base !== undefined && typeof body.base !== "string")
    ) {
      throw new DataError("Script and its base must be strings");
    }
    const node = toInstance(body.node, Node);
    try {
      node.script = await prepareScriptSource(node.script, body.base);
    } catch (err) {
      throw new DataError(`Can't prepare script: ${(err as Error).message}`);
    }
    return { script: node.script, sign: generateSign(node) };
  })
);
