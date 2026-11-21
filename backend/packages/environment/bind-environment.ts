import { VARIABLE_NAME } from "consts/core";
import { DataError } from "core-kit/types/errors";
import { Environment } from "models/environment";

/**
 * Checks the Bound Variables of a Project Environment and drops the own value
 * of each: a Bound Variable is read only from the User Variable it names.
 */
export function applyBindings(environment: Environment) {
  const { bindings, variables } = environment;
  if (!bindings) {
    return;
  }
  for (const [name, bound] of bindings) {
    if (!VARIABLE_NAME.test(name)) {
      throw new DataError(`Can't bind invalid variable name ${name}`);
    }
    if (typeof bound !== "string" || !VARIABLE_NAME.test(bound)) {
      throw new DataError(`Variable ${name} is bound to an invalid name`);
    }
    variables?.delete(name);
  }
  environment.visible = environment.visible?.filter(
    (name) => !bindings.has(name)
  );
  if (bindings.size === 0) {
    delete environment.bindings;
  }
}
