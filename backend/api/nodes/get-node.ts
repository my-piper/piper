import api from "app/api";
import mongo from "app/mongo";
import { NotFoundError } from "core-kit/types/errors";
import { handle } from "utils/http";

api.get(
  "/api/nodes/:_id",
  handle(() => async ({ params: { _id } }) => {
    const node = await mongo.nodes.findOne({ _id });
    if (!node) {
      throw new NotFoundError();
    }

    delete node["catalog"];
    return node;
  })
);
