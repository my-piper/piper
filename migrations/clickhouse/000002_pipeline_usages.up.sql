-- table
CREATE TABLE pipeline_usages (
  project String,
  pipeline String,
  launch String,
  launchedBy String,
  node String,
  processedAt DateTime,
  costs Decimal(14, 6),
  cursor String
) ENGINE = MergeTree PARTITION BY toYYYYMM(processedAt)
ORDER BY processedAt SETTINGS index_granularity = 8192;
-- consumer
CREATE TABLE pipeline_usages_consumer (
  project String,
  pipeline String,
  launch String,
  launchedBy String,
  node String,
  processedAt DateTime,
  costs Decimal(14, 6),
  cursor String
) ENGINE = Kafka(
  'kafka:9092',
  'pipeline.usages',
  'piper-clickhouse',
  'JSONEachRow'
);
-- mv
CREATE MATERIALIZED VIEW pipeline_usages_mv TO pipeline_usages AS
SELECT *
FROM pipeline_usages_consumer;