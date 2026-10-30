-- table
CREATE TABLE node_runs (
  startedAt DateTime64(3),
  launch String,
  project String,
  pipeline String,
  node String,
  launchedBy String,
  execution LowCardinality(String),
  attempt UInt16,
  result LowCardinality(String),
  waitMs UInt32,
  durationMs UInt32
) ENGINE = MergeTree PARTITION BY toYYYYMM(startedAt)
ORDER BY (project, pipeline, node, startedAt)
TTL toDateTime(startedAt) + INTERVAL 12 MONTH SETTINGS index_granularity = 8192;
-- consumer
CREATE TABLE node_runs_consumer (
  startedAt DateTime64(3),
  launch String,
  project String,
  pipeline String,
  node String,
  launchedBy String,
  execution String,
  attempt UInt16,
  result String,
  waitMs UInt32,
  durationMs UInt32
) ENGINE = Kafka(
  'kafka:9092',
  'pipeline.runs.nodes',
  'piper-clickhouse',
  'JSONEachRow'
);
-- mv
CREATE MATERIALIZED VIEW node_runs_mv TO node_runs AS
SELECT *
FROM node_runs_consumer;
