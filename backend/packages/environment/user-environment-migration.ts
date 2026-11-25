import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { Pipeline } from "models/pipeline";
import { Primitive } from "types/primitive";
import { declaredVariables } from "./prune-environment";

/**
 * Before the User Environment was dropped, a Project read the owner's User
 * Variable for every declared Variable it didn't set, or the User Variable a
 * binding named. Copies those values into the Project's own variables so its
 * launches keep the same values. Values stay encrypted with the same key.
 * `used` names the User Variables that were copied; `unresolved` names the
 * Bound Variables whose User Variable was missing: they were unset before
 * and now read the Global Variable they name, if there is one.
 */
export function overridesFromUserEnvironment(
  pipeline: Pipeline | undefined,
  project: Environment | undefined,
  user: Environment
) {
  const environment = project
    ? toInstance(toPlain(project), Environment)
    : new Environment({ variables: new Map<string, Primitive>() });
  environment.variables ??= new Map<string, Primitive>();
  const visible = new Set(environment.visible ?? []);
  const userVisible = new Set(user.visible ?? []);
  const used = new Set<string>();
  const unresolved: string[] = [];

  for (const name of declaredVariables(pipeline)) {
    if (environment.variables.has(name)) {
      continue;
    }
    const source = environment.bindings?.get(name) ?? name;
    const value = user.variables?.get(source);
    if (value === undefined) {
      if (environment.bindings?.has(name)) {
        unresolved.push(name);
      }
      continue;
    }
    environment.variables.set(name, value);
    environment.bindings?.delete(name);
    if (userVisible.has(source)) {
      visible.add(name);
    }
    used.add(source);
  }

  environment.visible = [...visible];
  if (environment.bindings?.size === 0) {
    delete environment.bindings;
  }
  return { environment, used, unresolved };
}
