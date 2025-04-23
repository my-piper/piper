-- [ ] add url to `user_balance_refills`
ALTER TABLE user_balance_refills
ADD COLUMN url String;
-- [ ] update `pipeline_metrics_finished` 
ALTER TABLE pipeline_metrics_finished
ADD COLUMN pipelineName String;
ALTER TABLE pipeline_metrics_finished
ADD COLUMN durationSecs UInt16;
ALTER TABLE pipeline_metrics_finished
ADD COLUMN errorsCount UInt8;
ALTER TABLE pipeline_metrics_finished DROP COLUMN fromStart;
--
DROP TABLE IF EXISTS pipeline_metrics_finished_consumer;
DROP VIEW IF EXISTS pipeline_metrics_finished_mv;
CREATE TABLE pipeline_metrics_finished_consumer (
    launch String,
    finishedAt DateTime,
    pipelineName String,
    durationSecs UInt16,
    errorsCount UInt8
) ENGINE = Kafka(
    'kafka:9092',
    'pipeline.metrics.finished',
    'piper-clickhouse',
    'JSONEachRow'
);
CREATE MATERIALIZED VIEW pipeline_metrics_finished_mv TO pipeline_metrics_finished AS
SELECT *
FROM pipeline_metrics_finished_consumer;