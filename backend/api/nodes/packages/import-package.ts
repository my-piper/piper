import api from "app/api";
import { toInstance } from "core-kit/utils/models";
import { checkLogged, handle } from "utils/http";
import * as YAML from "yaml";
import { uploadPackage } from "../../../logic/node-packages";
import { NodePackage } from "../../../models/node-package";

api.post(
  "/api/nodes/import-package",
  handle(({ currentUser }) => async ({ body }) => {
    checkLogged(currentUser);

    const yaml = YAML.parse(body.yaml);
    const nodePackage = toInstance(yaml, NodePackage);
    await uploadPackage(nodePackage);

    return null;
  })
);
