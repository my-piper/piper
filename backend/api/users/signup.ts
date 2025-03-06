import bcrypt from "bcrypt";
import { plainToInstance } from "class-transformer";
import { toPlain, validate } from "core-kit/utils/models";
import jwt from "jsonwebtoken";
import assign from "lodash/assign";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { JWT_EXPIRES, JWT_SECRET } from "../../consts/core";
import { User, UserBalance } from "../../models/user";
import { DataError } from "../../types/errors";
import { handle } from "../../utils/http";
import { Authorization } from "./models/authorization";
import { SignupRequest } from "./models/signup-request";

api.post(
  "/api/signup",
  handle(() => async ({ body }) => {
    const request = plainToInstance(SignupRequest, body as Object);
    await validate(request);

    const { email, login: _id, password } = request;

    {
      const user = new User({
        _id,
        email,
        balance: new UserBalance({
          available: 0,
          used: 0,
          remaining: 0,
          updatedAt: new Date(),
        }),
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

      const token = jwt.sign(toPlain(user), JWT_SECRET, {
        expiresIn: JWT_EXPIRES,
      });
      return toPlain(new Authorization({ token, user }));
    }
  })
);
