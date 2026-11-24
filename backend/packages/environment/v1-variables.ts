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

function rename<V>(map: Map<string, V> | undefined) {
  for (const [v1, current] of Object.entries(V1_VARIABLE_NAMES)) {
    if (!map?.has(v1)) {
      continue;
    }
    // a placeholder is no value, so a value sent under the v1 name wins
    if (!map.has(current) || isSecretPlaceholder(map.get(current))) {
      map.set(current, map.get(v1));
    }
    map.delete(v1);
  }
}

/**
 * Gives the Variables of an Environment pasted from Piper v1 their current
 * names. A Variable already set under the current name wins unless it holds
 * only a secret placeholder.
 */
export function renameV1Variables(environment: Environment) {
  rename(environment.variables);
  rename(environment.scope);
  rename(environment.bindings);
  if (environment.visible) {
    environment.visible = [
      ...new Set(
        environment.visible.map((name) => V1_VARIABLE_NAMES[name] ?? name)
      ),
    ];
  }
}
