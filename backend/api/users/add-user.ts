import api from "app/api";
import { toPlain } from "core-kit/utils/models";
import { checkAdmin, handle } from "utils/http";
import { add } from "../../logic/users/add-user";

api.post(
  "/api/users",
  handle(({ currentUser }) => async (req) => {
    checkAdmin(currentUser);

    const user = await add(req.body);
    delete user.password;
    return toPlain(user);
  })
);
