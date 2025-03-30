import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/utils/models";
import { checkAdmin, handle } from "utils/http";
import { NodePackage } from "../../../models/node-package";

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
