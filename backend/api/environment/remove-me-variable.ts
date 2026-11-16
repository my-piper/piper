import api from "app/api";
import { USER_ENVIRONMENT_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { checkLogged, handle } from "utils/http";

api.delete(
  "/api/me/environment/:key",
  handle(({ currentUser }) => async ({ params: { key } }) => {
    checkLogged(currentUser);

    const json = await redis.get(USER_ENVIRONMENT_KEY(currentUser._id));
    if (!json) {
      return null;
    }

    const environment = toInstance(JSON.parse(json), Environment);
    environment.variables?.delete(key);
    await redis.set(
      USER_ENVIRONMENT_KEY(currentUser._id),
      JSON.stringify(toPlain(environment))
    );

    return null;
  })
);
