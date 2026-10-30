import { Stream } from "core-kit/packages/stream";
import { LaunchRun } from "models/launch-run";
import { NodeRun } from "models/node-run";
import { PipelineErrorRecord } from "models/pipeline-error-record";
import { PipelineFinishedMetric } from "models/pipeline-finished-metric";
import { PipelineMessage } from "models/pipeline-message";
import { PipelineOutputMetric } from "models/pipeline-output-metric";
import { PipelineUsage } from "models/pipeline-usage";

export const streams = {
  pipeline: {
    messages: new Stream("pipeline.messages", PipelineMessage),
    usage: new Stream("pipeline.usages", PipelineUsage),
    errors: new Stream("pipeline.errors", PipelineErrorRecord),
    metrics: {
      outputs: new Stream("pipeline.metrics.outputs", PipelineOutputMetric),
      finished: new Stream("pipeline.metrics.finished", PipelineFinishedMetric),
    },
    runs: {
      nodes: new Stream("pipeline.runs.nodes", NodeRun),
      launches: new Stream("pipeline.runs.launches", LaunchRun),
    },
  },
};
