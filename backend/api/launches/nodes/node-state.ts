import api from "app/api";
import { handle } from "utils/http";
import { NODE_STATE } from "../../../consts/redis";
import { redis } from "../../../core-kit/services/redis/redis";

api.get(
  "/api/launches/:launch/nodes/:node/state",
  handle(() => async ({ params: { launch, node } }) => {
    return await redis.get(NODE_STATE(launch, node));
  })
);
