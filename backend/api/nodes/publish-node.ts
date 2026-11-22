import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { Node } from "models/node";
import { checkNodeIdFree } from "packages/nodes/script-node";
import { ensureSign } from "packages/nodes/sign-node";
import { checkLogged, handle, isEngineer } from "utils/http";

api.post(
  "/api/nodes",
  handle(({ currentUser }) => async ({ body }) => {
    checkLogged(currentUser);

    const node = toInstance(body, Node);
    await validate(node);

    const {
      catalog: { _id, version, category },
    } = node;
    checkNodeIdFree(_id);
    assign(node, { _id, version, category, package: node.catalog.package });
    ensureSign(node, _id, isEngineer(currentUser));

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
