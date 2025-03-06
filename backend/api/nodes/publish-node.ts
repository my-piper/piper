import { toInstance, toPlain, validate } from "core-kit/utils/models";
import assign from "lodash/assign";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { Node } from "../../models/node";
import { checkLogged, handle } from "../../utils/http";

api.post(
  "/api/nodes",
  handle(({ currentUser }) => async ({ body }) => {
    checkLogged(currentUser);

    const node = toInstance(body, Node);
    await validate(node);

    const {
      catalog: { id: _id, version, category },
    } = node;
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
