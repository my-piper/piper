import { toInstance } from "core-kit/utils/models";
import { api } from "../../app/api";
import { redis } from "../../app/redis";
import { LAUNCH, PIPELINE_OUTPUT } from "../../consts/redis";
import { Launch } from "../../models/launch";
import { NotFoundError } from "../../types/errors";
import { Primitive } from "../../types/primitive";
import { handle } from "../../utils/http";
import { fromRedisValue } from "../../utils/redis";

// TODO: looks like it is deprecated
api.get(
  "/api/launches/:_id/outputs",
  handle(() => async ({ params: { _id } }) => {
    const launch = await (async () => {
      const json = await redis.get(LAUNCH(_id));
      if (!json) {
        throw new NotFoundError("Launch is not found");
      }
      return toInstance(JSON.parse(json) as Object, Launch);
    })();

    const { pipeline } = launch;

    const outputs: { [key: string]: Primitive } = {};
    if (!!pipeline.outputs) {
      for (const [key, output] of pipeline.outputs) {
        const value = await redis.get(PIPELINE_OUTPUT(launch._id, key));
        if (value !== null) {
          const primitive = fromRedisValue(output.type, value);
          switch (output.type) {
            case "json":
              outputs[key] = JSON.parse(primitive as string);
              break;
            default:
              outputs[key] = primitive;
          }
        }
      }
    }

    return outputs;
  })
);
