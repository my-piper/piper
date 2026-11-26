import api from "app/api";
import { NODE_PROGRESS } from "consts/redis";
import redis from "core-kit/packages/redis";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:launch/:node/progress",
  handle(({ currentUser }) => async ({ params: { launch, node } }) => {
    await checkLaunchVisible(currentUser, launch);

    return await redis.get(NODE_PROGRESS(launch, node));
  })
);
