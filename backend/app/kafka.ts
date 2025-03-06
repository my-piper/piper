import { Kafka } from "kafkajs";
import { KAFKA_APP, KAFKA_BROKERS } from "../consts/core";

export default new Kafka({
  clientId: KAFKA_APP,
  brokers: KAFKA_BROKERS,
});
