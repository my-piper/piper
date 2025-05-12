import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/me",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);
    return toPlain(currentUser);
  })
);
