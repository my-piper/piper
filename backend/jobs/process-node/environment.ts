import { GLOBAL_ENVIRONMENT_KEY, USER_ENVIRONMENT_KEY } from "consts/redis";
import { readInstance } from "core-kit/packages/redis";
import { FatalError } from "core-kit/types/errors";
import { EnvironmentScope } from "enums/environment-scope";
import assign from "lodash-es/assign";
import { Environment } from "models/environment";
import { Launch } from "models/launch";
import { Node } from "models/node";
import { User } from "models/user";
import { decrypt } from "packages/environment/crypt-environment";
import { Primitive } from "types/primitive";

/**
 * Where a variable of each scope is read from, first match wins: the user
 * environment overrides the platform one and fills what the project leaves
 * empty.
 */
const LOOKUP_ORDER: Record<EnvironmentScope, EnvironmentScope[]> = {
  global: ["user", "global"],
  user: ["user"],
  pipeline: ["pipeline", "user"],
};

export async function getEnvironment({
  launch,
  launchedBy,
  node,
}: {
  launch?: Launch;
  launchedBy: User;
  node: Node;
}): Promise<Environment> {
  const env = new Environment({
    scope: new Map<string, EnvironmentScope>(),
    variables: new Map<string, Primitive>(),
  });
  if (node.environment) {
    const environment: {
      global?: Environment;
      user?: Environment;
      pipeline?: Environment;
    } = { pipeline: launch?.environment };

    // global environment
    {
      const global = await readInstance(GLOBAL_ENVIRONMENT_KEY, Environment);
      if (global) {
        assign(environment, { global });
      }
    }

    // user environment
    {
      const user = await readInstance(
        USER_ENVIRONMENT_KEY(launchedBy._id),
        Environment
      );
      if (user) {
        assign(environment, { user });
      }
    }

    for (const [k, v] of node.environment) {
      for (const source of LOOKUP_ORDER[v.scope] || []) {
        const value = environment[source]?.variables?.get(k);
        if (value !== undefined) {
          env.variables.set(k, value);
          env.scope.set(k, source);
          break;
        }
      }
    }

    try {
      decrypt(env);
    } catch (e) {
      throw new FatalError("Can't decrypt environment");
    }
  }

  return env;
}
