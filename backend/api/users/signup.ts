import api from "app/api";
import mongo from "app/mongo";
import bcrypt from "bcrypt";
import { plainToInstance } from "class-transformer";
import { INITIAL_USER_BALANCE } from "consts/billing";
import { DataError } from "core-kit/types/errors";
import { toPlain, validate } from "core-kit/utils/models";
import assign from "lodash/assign";
import { getToken } from "logic/users/auth";
import { refillBalance } from "logic/users/refill-balance";
import { ulid } from "ulid";
import { handle } from "utils/http";
import { User } from "../../models/user";
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

    if (INITIAL_USER_BALANCE > 0) {
      await refillBalance(_id, INITIAL_USER_BALANCE);
    }

    return toPlain(new Authorization({ token: getToken(user), user }));
  })
);
