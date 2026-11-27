-- table: one row per node execution (its repeats and retries), kept longer than node_runs
CREATE TABLE node_executions (
  startedAt DateTime64(3),
  finishedAt DateTime64(3),
  launch String,
  project String,
  pipeline String,
  node String,
  launchedBy String,
  execution LowCardinality(String),
  result LowCardinality(String),
  waitMs UInt32,
  durationMs UInt32,
  activeMs UInt32,
  invocations UInt32,
  attempts UInt16
) ENGINE = MergeTree PARTITION BY toYYYYMM(startedAt)
ORDER BY (project, node, startedAt)
TTL toDateTime(startedAt) + INTERVAL 90 DAY SETTINGS index_granularity = 8192;
-- consumer
CREATE TABLE node_executions_consumer (
  startedAt DateTime64(3),
  finishedAt DateTime64(3),
  launch String,
  project String,
  pipeline String,
  node String,
  launchedBy String,
  execution String,
  result String,
  waitMs UInt32,
  durationMs UInt32,
  activeMs UInt32,
  invocations UInt32,
  attempts UInt16
) ENGINE = Kafka(
  'kafka:9092',
  'pipeline.runs.executions',
  'piper-clickhouse',
  'JSONEachRow'
);
-- mv
CREATE MATERIALIZED VIEW node_executions_mv TO node_executions AS
SELECT *
FROM node_executions_consumer;
