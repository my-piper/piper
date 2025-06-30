import api from "app/api";
import mongo from "app/mongo";
import keyBy from "lodash/keyBy";
import { Node } from "models/node";
import { NodePackage } from "models/node-package";
import { checkAdmin, handle, toModel, toModels } from "utils/http";

api.get(
  "/api/node-packages/:_id/export",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    const nodePackage = toModel(
      await mongo.nodePackages.findOne({ _id }),
      NodePackage
    );

    if (!nodePackage.public) {
      checkAdmin(currentUser);
    }

    delete nodePackage.cursor;
    const nodes = toModels(
      await mongo.nodes.find({ package: _id }).toArray(),
      Node
    );
    for (const node of nodes) {
      delete node.sign;
    }

    return { ...nodePackage, nodes: keyBy(nodes, "_id") };
  })
);
