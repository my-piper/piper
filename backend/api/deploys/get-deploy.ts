import api from "app/api";
import * as deploys from "packages/deploy";
import { checkLogged, handle } from "utils/http";

const get = handle(
  ({ currentUser }) =>
    async ({ params: { slug, prefix } }) => {
      checkLogged(currentUser);

      return deploys.raw(slug, prefix);
    }
);

api.get("/api/:slug", get);
api.get("/api/:prefix/:slug", get);
