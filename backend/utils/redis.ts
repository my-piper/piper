import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Primitive } from "types/primitive";

const NULL_VALUE = "<!null!>";

export function toRedisValue(type: string, value: Primitive | null): string {
  if (value === null) {
    return NULL_VALUE;
  }
  switch (type) {
    case "boolean":
      return <boolean>value ? "1" : "";
    case "integer":
    case "float":
    case "image":
    case "image[]":
    case "archive":
    case "audio":
    case "video":
    case "json":
    case "string":
    case "string[]":
      return `${value}`;
    default:
      throw new Error(`Wrong type ${type}`);
  }
}

export function fromRedisValue(type: string, value: string): Primitive | null {
  if (value === NULL_VALUE) {
    return null;
  }
  switch (type) {
    case "boolean":
      return !!value;
    case "integer":
      return parseInt(value);
    case "float":
      return parseFloat(value);
    case "image":
    case "image[]":
    case "archive":
    case "audio":
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

export async function saveInstance<T>(key: string, data: T) {
  await redis.set(key, JSON.stringify(toPlain(data)));
}

export async function readObject(key: string): Promise<object | null> {
  const json = await redis.get(key);
  return !!json ? (JSON.parse(json) as object) : null;
}

export async function saveObject(key: string, data: Object) {
  await redis.set(key, JSON.stringify(data));
}

export async function loadRange<T>(
  key: string,
  type: new () => T
): Promise<T[]> {
  return ((await redis.lRange(key, 0, -1)) || []).map((json) =>
    toInstance(JSON.parse(json), type)
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
