import api from "app/api";
import { LAUNCH } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { Launch } from "models/launch";
import { handle } from "utils/http";
import { getNodeInputs } from "utils/node";

api.get(
  "/api/launches/:launch/:node/inputs",
  handle(() => async ({ params }) => {
    const launch = await (async () => {
      const json = await redis.get(LAUNCH(params.launch));
      if (!json) {
        throw new DataError("Launch is not found");
      }
      return toInstance(JSON.parse(json) as Object, Launch);
    })();

    const { pipeline } = launch;

    const node = pipeline.nodes.get(params.node);
    if (!node) {
      throw new DataError("Node is not found in pipeline");
    }

    return await getNodeInputs({ launch, node })(params.node);
  })
);
