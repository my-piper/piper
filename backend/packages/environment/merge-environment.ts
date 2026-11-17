import { HIDDEN_STRING } from "consts/core";
import { Environment } from "models/environment";
import { Primitive } from "types/primitive";
import { dropRevealedSecrets } from "./reveal-environment";

/**
 * Applies an update to a decrypted Environment. `HIDDEN_STRING` keeps a
 * stored value; `visible`, when sent, replaces the Visible Variables.
 */
export function merge(to: Environment, from: Environment) {
  const changed = new Set<string>();
  for (const [k, v] of from.variables || new Map<string, Primitive>()) {
    if (v !== HIDDEN_STRING) {
      to.variables.set(k, v);
      changed.add(k);
    }
  }
  if (from.visible) {
    const previouslyVisible = to.visible;
    to.visible = [...new Set(from.visible)];
    dropRevealedSecrets(to, previouslyVisible, changed);
  }
}
