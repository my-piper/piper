import api from "app/api";
import { USER_ENVIRONMENT_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { checkLogged, handle } from "utils/http";

api.delete(
  "/api/me/environment",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    redis.del(USER_ENVIRONMENT_KEY(currentUser._id));

    return null;
  })
);
