-- clear
DROP VIEW IF EXISTS pipeline_errors_mv;
DROP TABLE IF EXISTS pipeline_errors_consumer;
DROP TABLE IF EXISTS pipeline_errors;
-- table
CREATE TABLE pipeline_errors (
    occurredAt DateTime,
    launch String,
    project String,
    projectTitle String,
    node String,
    nodeTitle String,
    attempt UInt32,
    maxAttempts UInt32,
    message String
) ENGINE = MergeTree
PARTITION BY toYYYYMM(occurredAt)
ORDER BY occurredAt
SETTINGS index_granularity = 8192;

-- consumer
CREATE TABLE pipeline_errors_consumer (
    occurredAt DateTime,
    launch String,
    project String,
    projectTitle String,
    node String,
    nodeTitle String,
    attempt UInt32,
    maxAttempts UInt32,
    message String
) ENGINE = Kafka(
    'kafka:9092',
    'pipeline.errors',
    'piper-clickhouse',
    'JSONEachRow'
);
-- mv
CREATE MATERIALIZED VIEW pipeline_errors_mv TO pipeline_errors AS
SELECT *
FROM pipeline_errors_consumer;
