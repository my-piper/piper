import bcrypt from "bcrypt";
import { plainToInstance } from "class-transformer";
import { toPlain, validate } from "core-kit/utils/models";
import jwt from "jsonwebtoken";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { JWT_EXPIRES, JWT_SECRET } from "../../consts/core";
import { User } from "../../models/user";
import { DataError } from "../../types/errors";
import { handle, toModel } from "../../utils/http";
import { Authorization } from "./models/authorization";
import { UserCredentials } from "./models/user-credentials";

api.post(
  "/api/login",
  handle(() => async ({ body }) => {
    const request = plainToInstance(UserCredentials, body as Object);
    await validate(request);

    const { _id, password } = request;

    const user = toModel(
      await mongo.users.findOne(
        { _id },
        { projection: { name: 1, email: 1, password: 1 } }
      ),
      User
    );

    const matched = await bcrypt.compare(password, user.password);
    if (!matched) {
      throw new DataError("Email or password is incorrect");
    }

    const { email } = user;

    {
      const user = new User({ _id, email });
      const token = jwt.sign(toPlain(user), JWT_SECRET, {
        expiresIn: JWT_EXPIRES,
      });
      return toPlain(new Authorization({ token, user }));
    }
  })
);
