import { api } from "../../../app/api";
import { redis } from "../../../app/redis";
import { NODE_OUTPUTS } from "../../../consts/redis";
import { handle } from "../../../utils/http";

api.get(
  "/api/launches/:launch/:node/outputs",
  handle(() => async ({ params: { launch, node } }) => {
    const data = await redis.get(NODE_OUTPUTS(launch, node));
    return data || {};
  })
);
