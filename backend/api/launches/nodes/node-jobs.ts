import api from "app/api";
import { queues } from "app/queues";
import { LAUNCH, NODE_JOBS } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { NodeExecution } from "enums/node-execution";
import orderBy from "lodash/orderBy";
import { Launch } from "models/launch";
import { handle } from "utils/http";
import { BullJob } from "./models/bull-job";
import { NodeJob } from "./models/node-job";

api.get(
  "/api/launches/:launch/nodes/:node/jobs",
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

    const queue = (() => {
      switch (node.execution) {
        case NodeExecution.rapid:
          return queues.nodes.process.rapid;
        case NodeExecution.deferred:
          return queues.nodes.process.deferred;
        case NodeExecution.protracted:
          return queues.nodes.process.protracted;
        case NodeExecution.regular:
        default:
          return queues.nodes.process.regular;
      }
    })();

    const jobs = [];
    for (const id of await redis.sMembers(NODE_JOBS(launch._id, params.node))) {
      const job = await queue.getJob(id);
      const x = toInstance(job.toJSON(), BullJob);
      jobs.push(toPlain(new NodeJob(x)));
    }
    return orderBy(jobs, "finishedAt", "desc");
  })
);
