import api from "app/api";
import { handle } from "utils/http";
import { NODE_PROGRESS } from "../../../consts/redis";
import { redis } from "../../../core-kit/services/redis/redis";

api.get(
  "/api/launches/:launch/:node/progress",
  handle(() => async ({ params: { launch, node } }) => {
    return await redis.get(NODE_PROGRESS(launch, node));
  })
);
