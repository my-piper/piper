import { redis } from "app/redis";
import { JWT_SECRET } from "consts/core";
import { USER_API_TOKEN_EXPIRED, USER_API_TOKEN_KEY } from "consts/redis";
import { toPlain } from "core-kit/utils/models";
import { getHash } from "core-kit/utils/strings";
import jwt from "jsonwebtoken";
import { User } from "models/user";
import { api } from "../../app/api";
import { checkLogged, handle } from "../../utils/http";
import { ApiKey } from "./models/api-key";

api.post(
  "/api/me/api-key/generate",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const { _id } = currentUser;

    const user = new User({ _id });
    const token = jwt.sign(toPlain(user), JWT_SECRET);

    const hash = getHash(token);
    await redis.setEx(USER_API_TOKEN_KEY(hash), USER_API_TOKEN_EXPIRED, token);
    return new ApiKey({ hash });
  })
);
