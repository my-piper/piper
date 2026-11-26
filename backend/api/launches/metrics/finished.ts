import api from "app/api";
import clickhouse from "core-kit/packages/clickhouse";
import { toPlain } from "core-kit/packages/transform";
import { addYears } from "date-fns";
import { Response } from "express";
import { PipelineFinishedMetric } from "models/pipeline-finished-metric";
import { handle, toModels } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:launch/metrics/finished",
  handle(
    ({ currentUser }) =>
      async ({ params: { launch } }, resp: Response) => {
        await checkLaunchVisible(currentUser, launch);

        const metrics = toModels(
          await (
            await clickhouse.query({
              query: `select * from pipeline_metrics_finished where launch = {launch: String} limit 1`,
              format: "JSONEachRow",
              query_params: { launch },
            })
          ).json(),
          PipelineFinishedMetric
        );

        if (metrics.length > 0) {
          const [metric] = metrics;
          resp.set({
            // Private: the answer depends on who asks (checkLaunchVisible).
            "Cache-Control": "private, max-age=31536000, immutable",
            Expires: addYears(new Date(), 1).toUTCString(),
            etag: false,
          });
          return toPlain(metric);
        }
        return null;
      }
  )
);
