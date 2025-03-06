import { toPlain } from "core-kit/utils/models";
import { api } from "../../app/api";
import { addUser } from "../../logic/users/add-user";
import { checkAdmin, handle } from "../../utils/http";

api.post(
  "/api/users",
  handle(({ currentUser }) => async (req) => {
    checkAdmin(currentUser);

    const user = await addUser(req.body);
    delete user.password;
    return toPlain(user);
  })
);
