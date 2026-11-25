import api from "app/api";
import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { checkAdmin, handle } from "utils/http";

api.delete(
  "/api/environment/:key",
  handle(({ currentUser }) => async ({ params: { key } }) => {
    checkAdmin(currentUser);

    const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
    if (!json) {
      return null;
    }

    const environment = toInstance(JSON.parse(json), Environment);
    environment.variables?.delete(key);
    environment.visible = environment.visible?.filter((name) => name !== key);
    await redis.set(
      GLOBAL_ENVIRONMENT_KEY,
      JSON.stringify(toPlain(environment))
    );

    return null;
  })
);
