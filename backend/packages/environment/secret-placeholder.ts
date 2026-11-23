import { HIDDEN_STRING, V1_HIDDEN_STRING } from "consts/core";

/**
 * Whether a value sent for a Secret Variable is the placeholder shown in its
 * place rather than a value: the current one, or Piper v1's, which arrives
 * when an Environment copied from v1 is pasted. A placeholder keeps the
 * stored value.
 */
export function isSecretPlaceholder(value: unknown) {
  return value === HIDDEN_STRING || value === V1_HIDDEN_STRING;
}
