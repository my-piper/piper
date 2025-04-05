import api from "app/api";
import mongo from "app/mongo";
import bcrypt from "bcrypt";
import { mapTo, toPlain, validate } from "core-kit/utils/models";
import { User } from "models/user";
import { checkLogged, handle } from "utils/http";
import { ChangePasswordRequest } from "./models/change-password-request";

api.post(
  "/api/me/change-password",
  handle(({ currentUser }) => async ({ body }) => {
    checkLogged(currentUser);

    const request = mapTo(body, ChangePasswordRequest);
    await validate(request);

    const { password } = request;
    const { _id } = currentUser;

    const user = new User({
      password: await bcrypt.hash(password, 10),
    });
    await mongo.users.updateOne({ _id }, { $set: toPlain(user) });
    return null;
  })
);
