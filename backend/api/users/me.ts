import { toPlain } from "core-kit/utils/models";
import { api } from "../../app/api";
import { checkLogged, handle } from "../../utils/http";

api.get(
  "/api/me",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);
    return toPlain(currentUser);
  })
);
