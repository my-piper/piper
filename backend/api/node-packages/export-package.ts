import api from "app/api";
import mongo from "app/mongo";
import { toPlain } from "core-kit/packages/transform";
import { Node } from "models/node";
import { NodePackage } from "models/node-package";
import { checkAdmin, handle, toModel, toModels } from "utils/http";
import * as YAML from "yaml";

api.get(
  "/api/node-packages/:_id/export",
  handle(({ currentUser }) => async ({ params: { _id } }, resp) => {
    const nodePackage = toModel(
      await mongo.nodePackages.findOne({ _id }),
      NodePackage
    );

    if (!nodePackage.public) {
      checkAdmin(currentUser);
    }

    const nodes = toModels(
      await mongo.nodes.find({ package: _id }).toArray(),
      Node
    );

    nodePackage.nodes = new Map<string, Node>();
    for (const node of nodes) {
      delete node.sign;
      nodePackage.nodes.set(node._id, node);
    }

    delete nodePackage.cursor;

    resp.setHeader("Content-Type", "text/yaml; charset=utf-8");
    return YAML.stringify(toPlain(nodePackage));
  })
);
