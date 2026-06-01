import env from "../../env";

export const KAFKA_APP = "piper-app";
export const KAFKA_BROKERS = [env["KAFKA_BROKER"] || "kafka:9092"];
