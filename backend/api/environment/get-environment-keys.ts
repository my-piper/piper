import api from "app/api";
import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import { readInstance } from "core-kit/packages/redis";
import { Environment } from "models/environment";
import { checkLogged, handle } from "utils/http";

/** Names of the Platform Environment's variables, never their values. */
api.get(
  "/api/environment/keys",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const environment = await readInstance(GLOBAL_ENVIRONMENT_KEY, Environment);
    return { keys: [...(environment?.variables?.keys() || [])] };
  })
);
