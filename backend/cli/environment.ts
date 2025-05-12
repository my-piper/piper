import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { decrypt, encrypt } from "logic/environment/crypt-environment";
import { merge } from "logic/environment/merge-environment";
import { Environment } from "models/environment";
import { Primitive } from "types/primitive";

export async function set(name: string, value: Primitive) {
  const environment = new Environment({
    variables: new Map<string, Primitive>(),
  });
  environment.variables.set(name, value);
  await validate(environment);

  encrypt(environment);

  const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
  const global = !!json
    ? toInstance(JSON.parse(json), Environment)
    : new Environment({
        variables: new Map<string, Primitive>(),
      });

  merge(global, environment);
  await redis.set(GLOBAL_ENVIRONMENT_KEY, JSON.stringify(toPlain(global)));
}

export async function get() {
  const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
  const environment = !!json
    ? toInstance(JSON.parse(json), Environment)
    : new Environment({
        variables: new Map<string, Primitive>(),
      });

  decrypt(environment);
  return environment;
}

export async function remove(name: string) {
  const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
  const environment = !!json
    ? toInstance(JSON.parse(json), Environment)
    : new Environment({
        variables: new Map<string, Primitive>(),
      });

  environment.variables.delete(name);
  await redis.set(GLOBAL_ENVIRONMENT_KEY, JSON.stringify(toPlain(environment)));
}
