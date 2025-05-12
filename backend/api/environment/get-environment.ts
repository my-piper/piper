import api from "app/api";
import { HIDDEN_STRING } from "consts/core";
import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { Primitive } from "types/primitive";
import { checkAdmin, handle } from "utils/http";

api.get(
  "/api/environment",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
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
