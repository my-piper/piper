import api from "app/api";
import mongo from "app/mongo";
import bcrypt from "bcrypt";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { DataError, NotFoundError } from "core-kit/types/errors";
import { User } from "models/user";
import { getToken } from "packages/users/auth";
import { handle, toModel } from "utils/http";
import { Authorization } from "./models/authorization";
import { UserCredentials } from "./models/user-credentials";

api.post(
  "/api/login",
  handle(() => async ({ body }) => {
    const request = toInstance(body as Object, UserCredentials);
    await validate(request);

    const { identity, password } = request;

    let user: User;
    try {
      user = toModel(
        await mongo.users.findOne(
          {
            $or: [{ _id: identity }, { email: identity }],
          },
          { projection: { email: 1, password: 1 } }
        ),
        User
      );
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw new DataError("Email or password is incorrect");
      }
      throw e;
    }

    if (!user.password) {
      throw new DataError("You need to reset your password");
    }

    const matched = await bcrypt.compare(password, user.password);
    if (!matched) {
      throw new DataError("Email or password is incorrect");
    }

    const { _id, email } = user;

    {
      const user = new User({ _id, email });
      return toPlain(new Authorization({ token: getToken(user), user }));
    }
  })
);
