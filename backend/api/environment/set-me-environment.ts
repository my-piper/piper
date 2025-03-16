import { toInstance, toPlain, validate } from "core-kit/utils/models";
import { api } from "../../app/api";
import {
  USER_ENVIRONMENT_EXPIRED,
  USER_ENVIRONMENT_KEY,
} from "../../consts/redis";
import { redis } from "../../core-kit/services/redis/redis";
import { encrypt } from "../../logic/environment/crypt-environment";
import { merge } from "../../logic/environment/merge-environment";
import { Environment } from "../../models/environment";
import { Primitive } from "../../types/primitive";
import { checkLogged, handle } from "../../utils/http";

api.put(
  "/api/me/environment",
  handle(({ currentUser }) => async ({ body }) => {
    checkLogged(currentUser);

    const update = toInstance(body, Environment);
    await validate(update);

    const json = await redis.get(USER_ENVIRONMENT_KEY(currentUser._id));
    const environment = !!json
      ? toInstance(JSON.parse(json), Environment)
      : new Environment({
          variables: new Map<string, Primitive>(),
        });

    merge(environment, update);
    encrypt(environment);

    await redis.setEx(
      USER_ENVIRONMENT_KEY(currentUser._id),
      USER_ENVIRONMENT_EXPIRED,
      JSON.stringify(toPlain(environment))
    );

    return null;
  })
);
