import { plainToInstance } from "class-transformer";
import { toInstance, toPlain } from "core-kit/utils/models";
import { LAUNCH_EXPIRED } from "../consts/redis";
import { redis } from "../core-kit/services/redis/redis";
import { Primitive } from "../types/primitive";

export function toRedisValue(type: string, value: Primitive): string {
  switch (type) {
    case "boolean":
      return <boolean>value ? "1" : "";
    case "integer":
    case "float":
    case "image":
    case "image[]":
    case "video":
    case "json":
    case "string":
    case "string[]":
      return `${value}`;
    default:
      throw new Error(`Wrong type ${type}`);
  }
}

export function fromRedisValue(type: string, value: string): Primitive {
  switch (type) {
    case "boolean":
      return !!value;
    case "integer":
      return parseInt(value);
    case "float":
      return parseFloat(value);
    case "image":
    case "image[]":
    case "video":
    case "json":
    case "string":
    case "string[]":
      return value;
    default:
      throw new Error(`Wrong type ${type}`);
  }
}

export async function readInstance<T>(
  key: string,
  type: new () => T
): Promise<T | null> {
  const json = await redis.get(key);
  return !!json ? toInstance(JSON.parse(json) as Object, type) : null;
}

export async function saveInstance(key: string, data: Object) {
  await redis.setEx(key, LAUNCH_EXPIRED, JSON.stringify(toPlain(data)));
}

export async function readObject(key: string): Promise<object | null> {
  const json = await redis.get(key);
  return !!json ? (JSON.parse(json) as object) : null;
}

export async function saveObject(key: string, data: Object) {
  await redis.setEx(key, LAUNCH_EXPIRED, JSON.stringify(data));
}

export async function loadRange<T>(
  key: string,
  type: new () => T
): Promise<T[]> {
  return ((await redis.lRange(key, 0, -1)) || []).map((json) =>
    plainToInstance(type, JSON.parse(json))
  );
}

export async function locked(key: string): Promise<boolean> {
  return (await redis.get(key)) !== null;
}

export async function lock(key: string, time: number): Promise<void> {
  await redis.setEx(key, time, "x");
}

export async function release(key: string): Promise<void> {
  await redis.del(key);
}
