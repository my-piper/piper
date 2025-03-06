import { api } from "../../../app/api";
import { redis } from "../../../app/redis";
import { NODE_STATE } from "../../../consts/redis";
import { handle } from "../../../utils/http";

api.get(
  "/api/launches/:launch/nodes/:node/state",
  handle(() => async ({ params: { launch, node } }) => {
    return await redis.get(NODE_STATE(launch, node));
  })
);
