import api from "app/api";
import { NODE_OUTPUTS } from "consts/redis";
import redis from "core-kit/packages/redis";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:launch/:node/outputs",
  handle(({ currentUser }) => async ({ params: { launch, node } }) => {
    await checkLaunchVisible(currentUser, launch);

    const data = await redis.get(NODE_OUTPUTS(launch, node));
    return data || {};
  })
);
