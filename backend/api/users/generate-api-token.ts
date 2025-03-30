import api from "app/api";
import bcrypt from "bcrypt";
import { JWT_SECRET } from "consts/core";
import { USER_API_TOKEN_EXPIRED, USER_API_TOKEN_KEY } from "consts/redis";
import { redis } from "core-kit/services/redis";
import { toPlain } from "core-kit/utils/models";
import jwt from "jsonwebtoken";
import { User } from "models/user";
import { checkLogged, handle } from "utils/http";
import { Authorization } from "./models/authorization";

api.post(
  "/api/me/api-token/generate",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const { _id } = currentUser;

    const user = new User({ _id });
    console.log(toPlain(user));
    const token = jwt.sign(toPlain(user), JWT_SECRET);

    await redis.setEx(
      USER_API_TOKEN_KEY(_id),
      USER_API_TOKEN_EXPIRED,
      await bcrypt.hash(token, 10)
    );
    return new Authorization({ token });
  })
);
