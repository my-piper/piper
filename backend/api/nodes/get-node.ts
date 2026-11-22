import api from "app/api";
import mongo from "app/mongo";
import { NotFoundError } from "core-kit/types/errors";
import { toPlain } from "core-kit/packages/transform";
import { SCRIPT_NODE_ID, scriptNode } from "packages/nodes/script-node";
import { handle } from "utils/http";

api.get(
  "/api/nodes/:_id",
  handle(() => async ({ params: { _id } }) => {
    if (_id === SCRIPT_NODE_ID) {
      return toPlain(scriptNode());
    }

    const node = await mongo.nodes.findOne({ _id });
    if (!node) {
      throw new NotFoundError();
    }

    delete node["catalog"];
    return node;
  })
);
