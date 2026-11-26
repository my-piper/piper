import api from "app/api";
import clickhouse from "core-kit/packages/clickhouse";
import { PipelineOutputMetric } from "models/pipeline-output-metric";
import { handle, toModels } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:launch/metrics/outputs",
  handle(({ currentUser }) => async ({ params: { launch } }) => {
    await checkLaunchVisible(currentUser, launch);

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
