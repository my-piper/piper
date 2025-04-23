import { createLogger } from "core-kit/services/logger";
import { mapTo, toPlain } from "core-kit/utils/models";
import { Partitioners } from "kafkajs";
import { PipelineErrorRecord } from "models/pipeline-error-record";
import { PipelineFinishedMetric } from "models/pipeline-finished-metric";
import { PipelineMessage } from "models/pipeline-message";
import { PipelineOutputMetric } from "models/pipeline-output-metric";
import { PipelineUsage } from "models/pipeline-usage";
import kafka from "./kafka";

const logger = createLogger("stream");

class Stream<T extends Object> {
  private producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
  });

  constructor(
    private topic: string,
    private model: new () => T
  ) {}

  async connect() {
    await this.producer.connect();
  }

  async send(message: Partial<T>) {
    const plain = toPlain(mapTo(message, this.model));
    try {
      await this.producer.send({
        topic: this.topic,
        messages: [{ value: JSON.stringify(plain) }],
      });
    } catch (e) {
      logger.error(e);
    }
  }

  async disconnect() {
    await this.producer.disconnect();
  }
}

export const streams = {
  pipeline: {
    messages: new Stream("pipeline.messages", PipelineMessage),
    usage: new Stream("pipeline.usages", PipelineUsage),
    errors: new Stream("pipeline.errors", PipelineErrorRecord),
    metrics: {
      outputs: new Stream("pipeline.metrics.outputs", PipelineOutputMetric),
      finished: new Stream("pipeline.metrics.finished", PipelineFinishedMetric),
    },
  },
};
