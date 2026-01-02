import { DEPLOY } from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis from "core-kit/packages/redis";
import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { Deploy } from "models/deploy";
import "reflect-metadata";

const logger = createLogger("utils/deploy");

export async function get(
  slug: string,
  prefix: string = null
): Promise<Deploy> {
  return toInstance(JSON.parse(await raw(slug, prefix)) as object, Deploy);
}

export async function raw(
  slug: string,
  prefix: string = null
): Promise<string> {
  const json = await redis.get(DEPLOY(slug, prefix));
  if (!json) {
    throw new DataError(`Deploy ${slug} is not found`);
  }
  return json;
}
