import { createLogger } from "core-kit/packages/logger";
import { mapTo, toPlain } from "core-kit/packages/transform";
import { Partitioners } from "kafkajs";
import kafka from "./kafka";

const logger = createLogger("stream");

export class Stream<T extends Object> {
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
