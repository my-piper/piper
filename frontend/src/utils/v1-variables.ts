import { HIDDEN_STRING, V1_HIDDEN_STRING } from "src/consts/core";

/**
 * Variables Piper v1 named differently: v1 name -> current name. Mirrors
 * `backend/packages/environment/v1-variables.ts`.
 */
export const V1_VARIABLE_NAMES: Readonly<Record<string, string>> = {
  OPEN_PAAS_USER: "ARTWORKS_USER",
  OPEN_PAAS_PASSWORD: "ARTWORKS_PASSWORD",
  PAAS_BASE_URL: "ARTWORKS_URL",
};

/** The v1 name of a Variable, when Piper v1 named it differently. */
export function v1VariableName(name: string) {
  return Object.keys(V1_VARIABLE_NAMES).find(
    (v1) => V1_VARIABLE_NAMES[v1] === name,
  );
}

function rename(record: Record<string, unknown> | undefined) {
  if (!record) {
    return;
  }
  for (const [v1, current] of Object.entries(V1_VARIABLE_NAMES)) {
    if (!(v1 in record)) {
      continue;
    }
    // a placeholder is no value, so a value pasted under the v1 name wins
    const placeholder =
      record[current] === HIDDEN_STRING || record[current] === V1_HIDDEN_STRING;
    if (!(current in record) || placeholder) {
      record[current] = record[v1];
    }
    delete record[v1];
  }
}

/**
 * Gives the Variables of a plain Environment pasted from Piper v1 their
 * current names; a Variable already set under the current name wins unless
 * it holds only a secret placeholder. The server applies the same rule.
 */
export function renameV1Variables(environment: {
  variables?: Record<string, unknown>;
  scope?: Record<string, unknown>;
  bindings?: Record<string, unknown>;
  visible?: string[];
}) {
  rename(environment?.variables);
  rename(environment?.scope);
  rename(environment?.bindings);
  if (environment?.visible) {
    environment.visible = [
      ...new Set(
        environment.visible.map((name) => V1_VARIABLE_NAMES[name] ?? name),
      ),
    ];
  }
}
