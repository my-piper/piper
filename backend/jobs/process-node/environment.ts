import { GLOBAL_ENVIRONMENT_KEY, USER_ENVIRONMENT_KEY } from "consts/redis";
import { readInstance } from "core-kit/packages/redis";
import { FatalError } from "core-kit/types/errors";
import { EnvironmentScope } from "enums/environment-scope";
import assign from "lodash-es/assign";
import { Environment } from "models/environment";
import { Launch } from "models/launch";
import { Node } from "models/node";
import { User } from "models/user";
import { isScriptNode } from "packages/nodes/script-node";
import { decrypt } from "packages/environment/crypt-environment";
import { Primitive } from "types/primitive";

/**
 * Where a variable of each scope is read from, first match wins: the user
 * environment overrides the platform one and fills what the project leaves
 * empty. A Bound Variable is read only from the User Variable it names, and
 * only when the project's owner launches it; anyone else gets the same-name
 * lookup.
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
  // a Script Node is written by its user and never reads an Environment
  if (node.environment && !isScriptNode(node)) {
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

    // a binding picks one of its owner's own User Variables: it never
    // redirects the variables of someone else launching the project
    const ownLaunch =
      !!launchedBy._id && launch?.project?.createdBy?._id === launchedBy._id;
    const bindings = ownLaunch ? launch?.environment?.bindings : undefined;
    for (const [k, v] of node.environment) {
      const bound = v.scope === "pipeline" ? bindings?.get(k) : undefined;
      if (bound !== undefined) {
        const value = environment.user?.variables?.get(bound);
        if (value !== undefined) {
          env.variables.set(k, value);
          env.scope.set(k, "user");
        }
        continue;
      }
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
    } catch {
      throw new FatalError("Can't decrypt environment");
    }
  }

  return env;
}
