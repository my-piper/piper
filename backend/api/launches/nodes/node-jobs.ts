import { toInstance, toPlain } from "core-kit/utils/models";
import orderBy from "lodash/orderBy";
import { api } from "../../../app/api";
import { queues } from "../../../app/queue";
import { NODE_JOBS } from "../../../consts/redis";
import { redis } from "../../../core-kit/services/redis/redis";
import { handle } from "../../../utils/http";
import { BullJob } from "./models/bull-job";
import { NodeJob } from "./models/node-job";

api.get(
  "/api/launches/:launch/nodes/:node/jobs",
  handle(() => async ({ params: { launch, node } }) => {
    const jobs = [];
    for (const key of await redis.KEYS(NODE_JOBS(launch, node))) {
      const id = parseInt(key.split(":").pop());
      const job = await queues.nodes.getJob(id);
      const data = toInstance(job.toJSON(), BullJob);
      jobs.push(toPlain(new NodeJob(data)));
    }
    return orderBy(jobs, "finishedAt", "desc");
  })
);
