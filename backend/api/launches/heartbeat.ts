import api from "app/api";
import { LAUNCH_HEARTBEAT } from "consts/redis";
import redis from "core-kit/packages/redis";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/launches/:_id/heartbeat",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    return await redis.get(LAUNCH_HEARTBEAT(_id));
  })
);
