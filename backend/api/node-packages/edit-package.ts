import ajv from "app/ajv";
import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { NodePackage } from "models/node-package";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import { checkAdmin, handle } from "utils/http";

api.post(
  "/api/node-packages/:_id",
  handle(({ currentUser }) => async ({ params: { _id }, body }) => {
    checkAdmin(currentUser);

    const nodePackage = toInstance(body, NodePackage);
    const validate = ajv.compile(SCHEMAS.nodePackage);
    if (!validate(nodePackage)) {
      const { errors } = validate;
      throw new DataError(
        "Node package schema invalid",
        errors.map((e) => `${e.propertyName || e.instancePath}: ${e.message}`)
      );
    }

    const plain = toPlain(nodePackage);
    await mongo.nodePackages.updateOne({ _id }, { $set: plain });
    return plain;
  })
);
