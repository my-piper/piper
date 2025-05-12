import api from "app/api";
import * as deploys from "logic/deploy";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/:slug",
  handle(({ currentUser }) => async ({ params: { slug } }) => {
    checkLogged(currentUser);
    return deploys.raw(slug);
  })
);
