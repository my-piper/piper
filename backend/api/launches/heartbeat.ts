import api from "app/api";
import { LAUNCH_HEARTBEAT } from "consts/redis";
import redis from "core-kit/packages/redis";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:_id/heartbeat",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    await checkLaunchVisible(currentUser, _id);

    return await redis.get(LAUNCH_HEARTBEAT(_id));
  })
);
