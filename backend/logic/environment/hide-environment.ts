import { HIDDEN_STRING } from "consts/core";
import { Environment } from "models/environment";
import { Primitive } from "types/primitive";

export function hide(environment: Environment) {
  const { variables } = environment;
  for (const [k, v] of variables || new Map<string, Primitive>()) {
    if (typeof v === "string") {
      variables.set(k, HIDDEN_STRING);
    }
  }
}
