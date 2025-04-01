import api from "app/api";
import { checkLogged, handle } from "utils/http";
import * as deploys from "../../logic/deploy";

api.get(
  "/api/:slug",
  handle(({ currentUser }) => async ({ params: { slug } }) => {
    checkLogged(currentUser);
    return deploys.raw(slug);
  })
);
