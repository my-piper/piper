import { toInstance } from "core-kit/utils/models";
import "reflect-metadata";
import { redis } from "../../app/redis";
import { DEPLOY, DEPLOY_EXPIRED } from "../../consts/redis";
import { createLogger } from "../../logger";
import { Deploy } from "../../models/deploy";
import { DataError } from "../../types/errors";

const logger = createLogger("utils/deploy");

export async function get(slug: string): Promise<Deploy> {
  const json = await redis.get(DEPLOY(slug));
  if (!json) {
    throw new DataError(`Deploy ${slug} is not found`);
  }
  await redis.expire(DEPLOY(slug), DEPLOY_EXPIRED);
  return toInstance(JSON.parse(json) as object, Deploy);
}
