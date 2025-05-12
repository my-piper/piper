import api from "app/api";
import { NODE_STATUS } from "consts/redis";
import redis from "core-kit/packages/redis";
import { handle } from "utils/http";

api.get(
  "/api/launches/:launch/:node/status",
  handle(() => async ({ params: { launch, node } }) => {
    return await redis.get(NODE_STATUS(launch, node));
  })
);
