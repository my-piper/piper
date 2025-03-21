import orderBy from "lodash/orderBy";
import { api } from "../../../app/api";
import { handle } from "../../../utils/http";

api.get(
  "/api/launches/:launch/nodes/:node/jobs",
  handle(() => async ({ params: { launch, node } }) => {
    const jobs = [];
    // TODO: it should be refactored
    /*for (const key of await redis.KEYS(NODE_JOBS(launch, node))) {
      const id = parseInt(key.split(":").pop());
      const job = await queues.nodes.getJob(id);
      const data = toInstance(job.toJSON(), BullJob);
      jobs.push(toPlain(new NodeJob(data)));
    }*/
    return orderBy(jobs, "finishedAt", "desc");
  })
);
