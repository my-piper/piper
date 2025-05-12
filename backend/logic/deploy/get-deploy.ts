import { DEPLOY, DEPLOY_EXPIRED } from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis from "core-kit/packages/redis";
import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { Deploy } from "models/deploy";
import "reflect-metadata";

const logger = createLogger("utils/deploy");

export async function get(slug: string): Promise<Deploy> {
  return toInstance(JSON.parse(await raw(slug)) as object, Deploy);
}

export async function raw(slug: string): Promise<string> {
  const json = await redis.get(DEPLOY(slug));
  if (!json) {
    throw new DataError(`Deploy ${slug} is not found`);
  }
  await redis.expire(DEPLOY(slug), DEPLOY_EXPIRED);
  return json;
}
