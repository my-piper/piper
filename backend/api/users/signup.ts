import bcrypt from "bcrypt";
import { plainToInstance } from "class-transformer";
import { DataError } from "core-kit/types/errors";
import { toPlain, validate } from "core-kit/utils/models";
import assign from "lodash/assign";
import { getToken } from "logic/users/auth";
import { ulid } from "ulid";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { User } from "../../models/user";
import { handle } from "../../utils/http";
import { Authorization } from "./models/authorization";
import { SignupRequest } from "./models/signup-request";

api.post(
  "/api/signup",
  handle(() => async ({ body }) => {
    const request = plainToInstance(SignupRequest, body as Object);
    await validate(request);

    const { email, login: _id, password } = request;

    const now = new Date();

    const user = new User({
      _id,
      email,
      createdAt: now,
      cursor: ulid(),
    });
    if (!!password) {
      assign(user, { password: await bcrypt.hash(password, 10) });
    }
    try {
      await mongo.users.insertOne(toPlain(user) as { _id: string });
    } catch (err) {
      if (err?.code === 11000) {
        throw new DataError("User exists");
      }

      throw err;
    }

    return toPlain(new Authorization({ token: getToken(user), user }));
  })
);
