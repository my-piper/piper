import { Environment } from "models/environment";
import { Pipeline } from "models/pipeline";

/** Names of the Variables any Node of the pipeline declares. */
export function declaredVariables(pipeline: Pipeline | undefined) {
  const names = new Set<string>();
  for (const node of pipeline?.nodes?.values() ?? []) {
    for (const name of node.environment?.keys() ?? []) {
      names.add(name);
    }
  }
  return names;
}

/**
 * Drops the Overridden and Bound Variables no Node of the pipeline declares,
 * so the Project Environment always matches what its Nodes read. Returns
 * whether anything was dropped.
 */
export function pruneEnvironment(
  environment: Environment,
  pipeline: Pipeline | undefined
) {
  const declared = declaredVariables(pipeline);
  let pruned = false;
  for (const map of [environment.variables, environment.bindings]) {
    for (const name of [...(map?.keys() ?? [])]) {
      if (!declared.has(name)) {
        map.delete(name);
        pruned = true;
      }
    }
  }
  if (environment.visible) {
    const visible = environment.visible.filter((name) => declared.has(name));
    pruned ||= visible.length !== environment.visible.length;
    environment.visible = visible;
  }
  if (environment.bindings?.size === 0) {
    delete environment.bindings;
  }
  return pruned;
}
