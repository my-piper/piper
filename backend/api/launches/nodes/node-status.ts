import api from "app/api";
import { NODE_STATUS } from "consts/redis";
import redis from "core-kit/packages/redis";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:launch/:node/status",
  handle(({ currentUser }) => async ({ params: { launch, node } }) => {
    await checkLaunchVisible(currentUser, launch);

    return await redis.get(NODE_STATUS(launch, node));
  })
);
