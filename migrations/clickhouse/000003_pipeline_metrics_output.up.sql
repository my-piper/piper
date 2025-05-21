-- table
CREATE TABLE pipeline_metrics_outputs (
  launch String,
  output String,
  filledAt DateTime,
  fromStart UInt16
) ENGINE = MergeTree PARTITION BY toYYYYMM(filledAt)
ORDER BY filledAt SETTINGS index_granularity = 8192;
-- consumer
CREATE TABLE pipeline_metrics_outputs_consumer (
  launch String,
  output String,
  filledAt DateTime,
  fromStart UInt16
) ENGINE = Kafka(
  'kafka:9092',
  'pipeline.metrics.outputs',
  'piper-clickhouse',
  'JSONEachRow'
);
-- mv
CREATE MATERIALIZED VIEW pipeline_metrics_outputs_mv TO pipeline_metrics_outputs AS
SELECT *
FROM pipeline_metrics_outputs_consumer;