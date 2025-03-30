import api from "app/api";
import { toPlain } from "core-kit/utils/models";
import { addYears } from "date-fns";
import { Response } from "express";
import clickhouse from "../../../app/clickhouse";
import { PipelineFinishedMetric } from "../../../models/pipeline-finished-metric";
import { handle, toModels } from "../utils/http";

api.get(
  "/api/launches/:launch/metrics/finished",
  handle(() => async ({ params: { launch } }, resp: Response) => {
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
        "Cache-Control": "public, max-age=31536000, immutable",
        Expires: addYears(new Date(), 1).toUTCString(),
        "Surrogate-Control": "max-age=31536000",
        etag: false,
      });
      return toPlain(metric);
    }
    return null;
  })
);
