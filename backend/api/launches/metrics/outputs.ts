import api from "app/api";
import clickhouse from "app/clickhouse";
import { PipelineOutputMetric } from "models/pipeline-output-metric";
import { handle, toModels } from "utils/http";

api.get(
  "/api/launches/:launch/metrics/outputs",
  handle(() => async ({ params: { launch } }) => {
    const metrics = toModels(
      await (
        await clickhouse.query({
          query: `select * from pipeline_metrics_outputs where launch = {launch: String}`,
          format: "JSONEachRow",
          query_params: { launch },
        })
      ).json(),
      PipelineOutputMetric
    );

    const outputs = {};
    for (const metric of metrics) {
      outputs[metric.output] = metric;
    }

    return outputs;
  })
);
