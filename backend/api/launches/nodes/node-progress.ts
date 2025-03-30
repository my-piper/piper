import api from "app/api";
import { NODE_PROGRESS } from "../../../consts/redis";
import { redis } from "../../../core-kit/services/redis/redis";
import { handle } from "../utils/http";

api.get(
  "/api/launches/:launch/:node/progress",
  handle(() => async ({ params: { launch, node } }) => {
    return await redis.get(NODE_PROGRESS(launch, node));
  })
);
