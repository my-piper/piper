import api from "app/api";
import { handle } from "utils/http";
import { NODE_OUTPUTS } from "../../../consts/redis";
import { redis } from "../../../core-kit/services/redis/redis";

api.get(
  "/api/launches/:launch/:node/outputs",
  handle(() => async ({ params: { launch, node } }) => {
    const data = await redis.get(NODE_OUTPUTS(launch, node));
    return data || {};
  })
);
