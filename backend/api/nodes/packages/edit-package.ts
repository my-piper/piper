import api from "app/api";
import { toInstance, toPlain, validate } from "core-kit/utils/models";
import { NodePackage } from "../../../models/node-package";
import mongo from "../app/mongo";
import { checkAdmin, handle } from "../utils/http";

api.post(
  "/api/nodes/packages/:_id",
  handle(({ currentUser }) => async ({ params: { _id }, body }) => {
    checkAdmin(currentUser);

    const nodePackage = toInstance(body, NodePackage);
    await validate(nodePackage);

    await mongo.nodePackages.updateOne({ _id }, { $set: toPlain(nodePackage) });

    return null;
  })
);
