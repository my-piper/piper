import { DataError } from "core-kit/types/errors";
import { toInstance } from "core-kit/utils/models";
import "reflect-metadata";
import { DEPLOY, DEPLOY_EXPIRED } from "../../consts/redis";
import { redis } from "../../core-kit/services/redis/redis";
import { createLogger } from "../../logger";
import { Deploy } from "../../models/deploy";

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
