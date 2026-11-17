import api from "app/api";
import { USER_ENVIRONMENT_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { hide } from "packages/environment/hide-environment";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/me/environment",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const json = await redis.get(USER_ENVIRONMENT_KEY(currentUser._id));
    if (json) {
      const environment = toInstance(JSON.parse(json), Environment);
      hide(environment);
      return toPlain(environment);
    }

    return null;
  })
);
