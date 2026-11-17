import { HIDDEN_STRING } from "consts/core";
import { REDIS_SECRET_KEY } from "consts/redis";
import { Environment } from "models/environment";
import { Primitive } from "types/primitive";
import * as crypto from "utils/crypto";

/**
 * Prepares a stored (encrypted) Environment to be shown: Visible Variables
 * are decrypted, Secret Variables are replaced with `HIDDEN_STRING`.
 */
export function hide(environment: Environment) {
  const { variables } = environment;
  const visible = new Set(environment.visible ?? []);
  for (const [k, v] of variables || new Map<string, Primitive>()) {
    if (typeof v === "string") {
      variables.set(
        k,
        visible.has(k) ? crypto.decrypt(v, REDIS_SECRET_KEY) : HIDDEN_STRING
      );
    }
  }
}
