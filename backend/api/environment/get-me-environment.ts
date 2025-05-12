import api from "app/api";
import { HIDDEN_STRING } from "consts/core";
import { USER_ENVIRONMENT_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { Primitive } from "types/primitive";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/me/environment",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const json = await redis.get(USER_ENVIRONMENT_KEY(currentUser._id));
    if (!!json) {
      const environment = toInstance(JSON.parse(json), Environment);
      const { variables } = environment;
      for (const [k, v] of variables || new Map<string, Primitive>()) {
        switch (typeof v) {
          case "string":
            variables.set(k, HIDDEN_STRING);
            break;
        }
      }
      return toPlain(environment);
    }

    return null;
  })
);
