import api from "app/api";
import redis from "core-kit/services/redis";
import { toInstance, toPlain, validate } from "core-kit/utils/models";
import { checkAdmin, handle } from "utils/http";
import { GLOBAL_ENVIRONMENT_KEY } from "../../consts/redis";
import { encrypt } from "../../logic/environment/crypt-environment";
import { merge } from "../../logic/environment/merge-environment";
import { Environment } from "../../models/environment";
import { Primitive } from "../../types/primitive";

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
