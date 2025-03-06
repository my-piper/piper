import { toInstance } from "core-kit/utils/models";
import * as YAML from "yaml";
import { api } from "../../../app/api";
import { uploadPackage } from "../../../logic/node-packages";
import { NodePackage } from "../../../models/node-package";
import { checkLogged, handle } from "../../../utils/http";

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
