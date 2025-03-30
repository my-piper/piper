import api from "app/api";
import { toPlain } from "core-kit/utils/models";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/me",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);
    return toPlain(currentUser);
  })
);
