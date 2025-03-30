import api from "app/api";
import { handle } from "utils/http";
import { NODE_STATUS } from "../../../consts/redis";
import { redis } from "../../../core-kit/services/redis/redis";

api.get(
  "/api/launches/:launch/:node/status",
  handle(() => async ({ params: { launch, node } }) => {
    return await redis.get(NODE_STATUS(launch, node));
  })
);
