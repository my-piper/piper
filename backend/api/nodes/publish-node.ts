import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { Node } from "models/node";
import { checkNodeIdFree } from "packages/nodes/script-node";
import { checkEngineer, handle } from "utils/http";

api.post(
  "/api/nodes",
  handle(({ currentUser }) => async ({ body }) => {
    checkEngineer(currentUser);

    const node = toInstance(body, Node);
    await validate(node);

    const {
      catalog: { _id, version, category },
    } = node;
    checkNodeIdFree(_id);
    assign(node, { _id, version, category, package: node.catalog.package });

    const plain = toPlain(node);
    plain["source"] = "catalog";
    delete plain["catalog"];

    await mongo.nodes.updateOne(
      { _id },
      { $set: plain },
      {
        upsert: true,
      }
    );

    return null;
  })
);
