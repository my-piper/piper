-- table
CREATE TABLE launch_runs (
  launchedAt DateTime64(3),
  startedAt DateTime64(3),
  finishedAt DateTime64(3),
  launch String,
  project String,
  pipeline String,
  launchedBy String,
  scope String,
  status LowCardinality(String),
  queuedMs UInt32,
  durationMs UInt32
) ENGINE = MergeTree PARTITION BY toYYYYMM(launchedAt)
ORDER BY (project, pipeline, launchedAt) SETTINGS index_granularity = 8192;
-- consumer
CREATE TABLE launch_runs_consumer (
  launchedAt DateTime64(3),
  startedAt DateTime64(3),
  finishedAt DateTime64(3),
  launch String,
  project String,
  pipeline String,
  launchedBy String,
  scope String,
  status String,
  queuedMs UInt32,
  durationMs UInt32
) ENGINE = Kafka(
  'kafka:9092',
  'pipeline.runs.launches',
  'piper-clickhouse',
  'JSONEachRow'
);
-- mv
CREATE MATERIALIZED VIEW launch_runs_mv TO launch_runs AS
SELECT *
FROM launch_runs_consumer;
