import { Environment } from "models/environment";
import { Primitive } from "types/primitive";
import { dropRevealedSecrets } from "./reveal-environment";
import { isSecretPlaceholder } from "./secret-placeholder";
import { renameV1Variables } from "./v1-variables";

/**
 * Applies an update to a decrypted Environment. A Secret Variable placeholder
 * (see `isSecretPlaceholder`) keeps a stored value; `visible`, when sent,
 * replaces the Visible Variables. Variables named as in Piper v1 take their
 * current names on both sides first.
 */
export function merge(to: Environment, from: Environment) {
  renameV1Variables(to);
  renameV1Variables(from);
  const changed = new Set<string>();
  for (const [k, v] of from.variables || new Map<string, Primitive>()) {
    if (!isSecretPlaceholder(v)) {
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
