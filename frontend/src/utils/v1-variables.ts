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

/** Whether a Variable's value was pasted anew, not shown back. */
export type SentValue = (name: string) => boolean;

function isPlaceholder(value: unknown) {
  return value === HIDDEN_STRING || value === V1_HIDDEN_STRING;
}

/** Moves each v1 name to its current name; returns those whose value moved. */
function rename(
  record: Record<string, unknown> | undefined,
  sent: SentValue,
): Set<string> {
  const taken = new Set<string>();
  if (!record) {
    return taken;
  }
  for (const [v1, current] of Object.entries(V1_VARIABLE_NAMES)) {
    if (!(v1 in record)) {
      continue;
    }
    if (!(current in record) || (isPlaceholder(record[current]) && sent(v1))) {
      record[current] = record[v1];
      taken.add(v1);
    }
    delete record[v1];
  }
  return taken;
}

/**
 * Gives the Variables of a plain Environment pasted from Piper v1 their
 * current names. A Variable already set under the current name wins, unless
 * it holds only a placeholder and a value was pasted under the v1 name; a v1
 * name stays visible only when its value moved. The server applies the same
 * rule.
 */
export function renameV1Variables(
  environment: {
    variables?: Record<string, unknown>;
    scope?: Record<string, unknown>;
    bindings?: Record<string, unknown>;
    visible?: string[];
  },
  sent: SentValue = () => true,
) {
  const taken = rename(environment?.variables, sent);
  rename(environment?.scope, sent);
  rename(environment?.bindings, sent);
  if (environment?.visible) {
    environment.visible = [
      ...new Set(
        environment.visible
          .filter((name) => !(name in V1_VARIABLE_NAMES) || taken.has(name))
          .map((name) => V1_VARIABLE_NAMES[name] ?? name),
      ),
    ];
  }
}
