-- clear
DROP VIEW IF EXISTS pipeline_metrics_finished_mv;
DROP TABLE IF EXISTS pipeline_metrics_finished_consumer;
DROP TABLE IF EXISTS pipeline_metrics_finished;
-- table
CREATE TABLE pipeline_metrics_finished (
    launch String,
    finishedAt DateTime,
    fromStart UInt16
) ENGINE = MergeTree 
PARTITION BY toYYYYMM(finishedAt)
ORDER BY finishedAt 
SETTINGS index_granularity = 8192;

-- consumer
CREATE TABLE pipeline_metrics_finished_consumer (
    launch String,
    finishedAt DateTime,
    fromStart UInt16
) ENGINE = Kafka(
    'kafka:9092',
    'pipeline.metrics.finished',
    'piper-clickhouse',
    'JSONEachRow'
);
-- mv
CREATE MATERIALIZED VIEW pipeline_metrics_finished_mv TO pipeline_metrics_finished AS
SELECT *
FROM pipeline_metrics_finished_consumer;