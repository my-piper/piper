-- table
CREATE TABLE pipeline_messages (
  createdAt DateTime,
  project String,
  launch String,
  node String,
  type String,
  message String
) ENGINE = MergeTree PARTITION BY toYYYYMM(createdAt)
ORDER BY createdAt SETTINGS index_granularity = 8192;
-- consumer
CREATE TABLE pipeline_messages_consumer (
  createdAt DateTime,
  project String,
  launch String,
  node String,
  type String,
  message String
) ENGINE = Kafka(
  'kafka:9092',
  'pipeline.messages',
  'piper-clickhouse',
  'JSONEachRow'
);
-- mv
CREATE MATERIALIZED VIEW pipeline_messages_mv TO pipeline_messages AS
SELECT *
FROM pipeline_messages_consumer;