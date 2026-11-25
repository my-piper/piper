import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import { readInstance } from "core-kit/packages/redis";
import { FatalError } from "core-kit/types/errors";
import { EnvironmentScope } from "enums/environment-scope";
import { Environment } from "models/environment";
import { Launch } from "models/launch";
import { Node } from "models/node";
import { decrypt } from "packages/environment/crypt-environment";
import { Primitive } from "types/primitive";

/**
 * Each Variable a Node declares is read from the Project's own value (an
 * Overridden Variable), else from the Global Variable it is bound to: the one
 * its binding names, or the one of the same name. A missing Global Variable
 * leaves it unset.
 */
export async function getEnvironment({
  launch,
  node,
}: {
  launch?: Launch;
  node: Node;
}): Promise<Environment> {
  const env = new Environment({
    scope: new Map<string, EnvironmentScope>(),
    variables: new Map<string, Primitive>(),
  });
  if (node.environment) {
    const project = launch?.environment;
    const global = await readInstance(GLOBAL_ENVIRONMENT_KEY, Environment);
    for (const name of node.environment.keys()) {
      const own = project?.variables?.get(name);
      if (own !== undefined) {
        env.variables.set(name, own);
        env.scope.set(name, "pipeline");
        continue;
      }
      const bound = project?.bindings?.get(name) ?? name;
      const value = global?.variables?.get(bound);
      if (value !== undefined) {
        env.variables.set(name, value);
        env.scope.set(name, "global");
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
