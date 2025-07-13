import api from "app/api";
import clickhouse from "core-kit/packages/clickhouse";
import { toInstance, validate } from "core-kit/packages/transform";
import sql from "sql-bricks-sqlite";
import { checkLogged, handle } from "utils/http";
import { PipelineUsagesFilter } from "./models";

const PAGE_LIMIT = 20;

api.get(
  "/api/pipeline-usages",
  handle(({ currentUser }) => async ({ query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, PipelineUsagesFilter);
    await validate(filter);

    const { cursor } = filter;

    return await (
      await clickhouse.query({
        query: (() => {
          let query = sql
            .select()
            .from("pipeline_usages")
            .where({ launchedBy: currentUser._id })
            .orderBy("cursor desc")
            .limit(PAGE_LIMIT);
          if (!!cursor) {
            query = query.where(sql.lt("cursor", cursor));
          }
          return query.toString();
        })(),
        format: "JSONEachRow",
      })
    ).json();
  })
);
