import api from "app/api";
import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { hide } from "packages/environment/hide-environment";
import { checkAdmin, handle } from "utils/http";

api.get(
  "/api/environment",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
    if (json) {
      const environment = toInstance(JSON.parse(json), Environment);
      hide(environment);
      return toPlain(environment);
    }

    return null;
  })
);
