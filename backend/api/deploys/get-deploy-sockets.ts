import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import * as deploys from "packages/deploy";
import { checkLogged, handle } from "utils/http";
import { DeployNode } from "./models/deploy-node";

// Anyone logged in may launch a Deploy by its link (ADR 0008), so anyone
// logged in may see the inputs and outputs a Node running it gets.
const get = handle(
  ({ currentUser }) =>
    async ({ params: { slug, prefix } }) => {
      checkLogged(currentUser);

      const deploy = await deploys.get(slug, prefix);
      const { inputs, outputs } = deploys.deploySockets(deploy);
      return toPlain(
        new DeployNode({
          prefix: deploy.prefix,
          slug: deploy.slug,
          title: deploy.project?.title,
          deployedAt: deploy.deployedAt,
          inputs,
          outputs,
        })
      );
    }
);

api.get("/api/deploys/:slug/sockets", get);
api.get("/api/deploys/:prefix/:slug/sockets", get);
