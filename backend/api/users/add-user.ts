import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import { add } from "logic/users/add-user";
import { checkAdmin, handle } from "utils/http";

api.post(
  "/api/users",
  handle(({ currentUser }) => async (req) => {
    checkAdmin(currentUser);

    const user = await add(req.body);
    delete user.password;
    return toPlain(user);
  })
);
