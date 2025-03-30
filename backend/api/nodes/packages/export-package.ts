import api from "app/api";
import keyBy from "lodash/keyBy";
import mongo from "../app/mongo";
import { checkAdmin, handle } from "../utils/http";

api.get(
  "/api/nodes/packages/:_id/export",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkAdmin(currentUser);

    const nodePackage = await mongo.nodePackages.findOne({ _id });
    delete nodePackage["cursor"];
    const nodes = await mongo.nodes.find({ package: _id }).toArray();

    return { ...nodePackage, nodes: keyBy(nodes, "_id") };
  })
);
