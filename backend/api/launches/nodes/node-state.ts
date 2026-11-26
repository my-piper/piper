import api from "app/api";
import { NODE_STATE } from "consts/redis";
import redis from "core-kit/packages/redis";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:launch/nodes/:node/state",
  handle(({ currentUser }) => async ({ params: { launch, node } }) => {
    await checkLaunchVisible(currentUser, launch);

    return await redis.get(NODE_STATE(launch, node));
  })
);
