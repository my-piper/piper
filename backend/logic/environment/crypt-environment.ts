import { REDIS_SECRET_KEY } from "../../consts/redis";
import { Environment } from "../../models/environment";
import { Primitive } from "../../types/primitive";
import * as crypto from "../../utils/crypto";

export function encrypt(environment: Environment) {
  const { variables } = environment;
  for (const [k, v] of variables || new Map<string, Primitive>()) {
    if (typeof v === "string") {
      variables.set(k, crypto.encrypt(v as string, REDIS_SECRET_KEY));
    }
  }
}

export function decrypt(environment: Environment) {
  const { variables } = environment;
  for (const [k, v] of variables || new Map<string, Primitive>()) {
    if (typeof v === "string") {
      variables.set(k, crypto.decrypt(v as string, REDIS_SECRET_KEY));
    }
  }
}
