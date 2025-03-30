import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/utils/models";
import assign from "lodash/assign";
import { ulid } from "ulid";
import { checkAdmin, handle } from "utils/http";
import { NodePackage } from "../../../models/node-package";

api.post(
  "/api/nodes/packages",
  handle(({ currentUser }) => async ({ body }) => {
    checkAdmin(currentUser);

    const nodePackage = toInstance(body, NodePackage);
    await validate(nodePackage);

    assign(nodePackage, { cursor: ulid() });

    const plain = toPlain(nodePackage);
    await mongo.nodePackages.insertOne(plain as { _id: string });

    return plain;
  })
);
