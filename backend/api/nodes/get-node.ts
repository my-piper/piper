import api from "app/api";
import mongo from "app/mongo";
import { handle } from "utils/http";

api.get(
  "/api/nodes/:_id",
  handle(() => ({ params: { _id } }) => {
    const node = mongo.nodes.findOne({ _id });
    delete node["catalog"];
    return node;
  })
);
