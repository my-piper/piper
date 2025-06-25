import api from "app/api";
import mongo from "app/mongo";
import keyBy from "lodash/keyBy";
import { checkAdmin, handle } from "utils/http";

api.get(
  "/api/node-packages/:_id/export",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkAdmin(currentUser);

    const nodePackage = await mongo.nodePackages.findOne({ _id });
    delete nodePackage["cursor"];
    const nodes = await mongo.nodes.find({ package: _id }).toArray();
    for (const node of nodes) {
      delete node["sign"];
    }

    return { ...nodePackage, nodes: keyBy(nodes, "_id") };
  })
);
