import api from "app/api";
import { NODE_LOGS } from "consts/redis";
import redis from "core-kit/packages/redis";
import { handle } from "utils/http";

api.get(
  "/api/launches/:launch/nodes/:node/logs",
  handle(() => async ({ params: { launch, node } }) => {
    const logs = await redis.lRange(NODE_LOGS(launch, node), 0, -1);
    return logs.map((e) => JSON.parse(e)).reverse();
  })
);
