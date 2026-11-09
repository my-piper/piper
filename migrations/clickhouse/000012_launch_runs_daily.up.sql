-- daily rollup of launch_runs: raw runs expire after 7 days, the rollup keeps a year of stats
-- aggregate aliases must not match source columns, ClickHouse resolves an alias first
CREATE TABLE launch_runs_daily (
  project String,
  day Date,
  status LowCardinality(String),
  runs SimpleAggregateFunction(sum, UInt64),
  queuedMsSum SimpleAggregateFunction(sum, UInt64),
  durationMsSum SimpleAggregateFunction(sum, UInt64),
  maxDurationMs SimpleAggregateFunction(max, UInt32),
  durationQuantiles AggregateFunction(quantilesTDigest(0.5, 0.95), UInt32),
  lastLaunchedAt SimpleAggregateFunction(max, DateTime64(3))
) ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day)
ORDER BY (project, day, status)
TTL day + INTERVAL 12 MONTH SETTINGS index_granularity = 8192;
-- mv
CREATE MATERIALIZED VIEW launch_runs_daily_mv TO launch_runs_daily AS
SELECT project,
  toDate(launchedAt) AS day,
  status,
  count() AS runs,
  sum(queuedMs) AS queuedMsSum,
  sum(durationMs) AS durationMsSum,
  max(durationMs) AS maxDurationMs,
  quantilesTDigestState(0.5, 0.95)(durationMs) AS durationQuantiles,
  max(launchedAt) AS lastLaunchedAt
FROM launch_runs
GROUP BY project, day, status;
-- backfill the runs still kept in launch_runs
INSERT INTO launch_runs_daily
SELECT project,
  toDate(launchedAt) AS day,
  status,
  count() AS runs,
  sum(queuedMs) AS queuedMsSum,
  sum(durationMs) AS durationMsSum,
  max(durationMs) AS maxDurationMs,
  quantilesTDigestState(0.5, 0.95)(durationMs) AS durationQuantiles,
  max(launchedAt) AS lastLaunchedAt
FROM launch_runs
GROUP BY project, day, status;
