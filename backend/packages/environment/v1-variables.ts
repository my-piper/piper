import { Environment } from "models/environment";
import { isSecretPlaceholder } from "./secret-placeholder";

/**
 * Variables Piper v1 named differently: v1 name -> current name. The YAML
 * editor applies the same map locally (`frontend/src/utils/v1-variables.ts`).
 */
const V1_VARIABLE_NAMES: Readonly<Record<string, string>> = {
  OPEN_PAAS_USER: "ARTWORKS_USER",
  OPEN_PAAS_PASSWORD: "ARTWORKS_PASSWORD",
  PAAS_BASE_URL: "ARTWORKS_URL",
};

/** Whether a Variable's value was sent in this write, not shown back. */
export type SentValue = (name: string) => boolean;

/**
 * Moves each v1 name to its current name, and returns the v1 names whose value
 * the current name took. The current name keeps its own value unless that is
 * a placeholder standing for a value sent under the v1 name.
 */
function rename<V>(map: Map<string, V> | undefined, sent: SentValue) {
  const taken = new Set<string>();
  for (const [v1, current] of Object.entries(V1_VARIABLE_NAMES)) {
    if (!map?.has(v1)) {
      continue;
    }
    if (
      !map.has(current) ||
      (isSecretPlaceholder(map.get(current)) && sent(v1))
    ) {
      map.set(current, map.get(v1));
      taken.add(v1);
    }
    map.delete(v1);
  }
  return taken;
}

/**
 * Gives the Variables of an Environment pasted from Piper v1 their current
 * names. A Variable already set under the current name wins, unless it holds
 * only a placeholder and a value was sent under the v1 name. A v1 name stays
 * visible only when its value moved: a secret kept under the current name is
 * never made visible by it.
 */
export function renameV1Variables(
  environment: Environment,
  sent: SentValue = () => true
) {
  const taken = rename(environment.variables, sent);
  rename(environment.scope, sent);
  rename(environment.bindings, sent);
  if (environment.visible) {
    environment.visible = [
      ...new Set(
        environment.visible
          .filter((name) => !(name in V1_VARIABLE_NAMES) || taken.has(name))
          .map((name) => V1_VARIABLE_NAMES[name] ?? name)
      ),
    ];
  }
}
