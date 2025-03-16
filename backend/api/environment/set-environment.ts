import { toInstance, toPlain, validate } from "core-kit/utils/models";
import { api } from "../../app/api";
import { GLOBAL_ENVIRONMENT_KEY } from "../../consts/redis";
import { redis } from "../../core-kit/services/redis/redis";
import { encrypt } from "../../logic/environment/crypt-environment";
import { merge } from "../../logic/environment/merge-environment";
import { Environment } from "../../models/environment";
import { Primitive } from "../../types/primitive";
import { checkAdmin, handle } from "../../utils/http";

api.put(
  "/api/environment",
  handle(({ currentUser }) => async ({ body }) => {
    checkAdmin(currentUser);

    const update = toInstance(body, Environment);
    await validate(update);

    const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
    const environment = !!json
      ? toInstance(JSON.parse(json), Environment)
      : new Environment({
          variables: new Map<string, Primitive>(),
        });

    merge(environment, update);
    encrypt(environment);

    await redis.set(
      GLOBAL_ENVIRONMENT_KEY,
      JSON.stringify(toPlain(environment))
    );

    return null;
  })
);
