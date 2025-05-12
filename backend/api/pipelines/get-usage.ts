import api from "app/api";
import clickhouse from "app/clickhouse";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/pipelines/usage",
  handle(({ currentUser }) => async ({ params: { launch } }) => {
    checkLogged(currentUser);

    return await (
      await clickhouse.query({
        query: `select * from pipeline_usages 
            where launchedBy = {launchedBy: String}
            order by processedAt desc`,
        format: "JSONEachRow",
        query_params: { launchedBy: currentUser?._id },
      })
    ).json();
  })
);
