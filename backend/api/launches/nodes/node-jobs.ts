import api from "app/api";
import { LAUNCH, NODE_JOBS } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import orderBy from "lodash/orderBy";
import { Launch } from "models/launch";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";
import { processQueue } from "packages/nodes/plan-node";
import { BullJob } from "./models/bull-job";
import { NodeJob } from "./models/node-job";

api.get(
  "/api/launches/:launch/nodes/:node/jobs",
  handle(({ currentUser }) => async ({ params }) => {
    await checkLaunchVisible(currentUser, params.launch);

    const launch = await (async () => {
      const json = await redis.get(LAUNCH(params.launch));
      if (!json) {
        throw new DataError("Launch is not found");
      }
      return toInstance(JSON.parse(json) as object, Launch);
    })();

    const { pipeline } = launch;

    const node = pipeline.nodes.get(params.node);
    if (!node) {
      throw new DataError("Node is not found in pipeline");
    }

    const queue = processQueue(node);

    const jobs = [];
    for (const id of await redis.sMembers(NODE_JOBS(launch._id, params.node))) {
      const job = await queue.getJob(id);
      const x = toInstance(job.toJSON(), BullJob);
      jobs.push(toPlain(new NodeJob(x)));
    }
    return orderBy(jobs, "finishedAt", "desc");
  })
);
