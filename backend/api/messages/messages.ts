import api from "app/api";
import { toInstance, toPlain, validate } from "core-kit/utils/models";
import sql from "sql-bricks";
import { handle, toModels } from "utils/http";
import clickhouse from "../../app/clickhouse";
import { PipelineMessage } from "../../models/pipeline-message";
import { PipelineMessagesFilter } from "./models/messages-filter";

api.get(
  "/api/pipeline-messages",
  handle(() => async ({ query }) => {
    const filter = toInstance(query, PipelineMessagesFilter);
    await validate(filter);

    const { launch, project } = filter;

    const messages = toModels(
      await (
        await clickhouse.query({
          query: (() => {
            let query = sql
              .select()
              .from("pipeline_messages")
              .orderBy("createdAt desc");
            if (!!launch) {
              query = query.where({ launch });
            }
            if (!!project) {
              query = query.where({ project });
            }
            return query.toString();
          })(),
          format: "JSONEachRow",
        })
      ).json(),
      PipelineMessage
    );

    return messages.map((m) => toPlain(m));
  })
);
