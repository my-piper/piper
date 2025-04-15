import { HIDDEN_STRING } from "consts/core";
import { Environment } from "../../models/environment";
import { Primitive } from "../../types/primitive";

export function merge(to: Environment, from: Environment) {
  for (const [k, v] of from.variables || new Map<string, Primitive>()) {
    if (v !== HIDDEN_STRING) {
      to.variables.set(k, v);
    }
  }
}
