ALTER TABLE pipeline_metrics_outputs MODIFY TTL filledAt + INTERVAL 7 DAY;
ALTER TABLE pipeline_metrics_finished MODIFY TTL finishedAt + INTERVAL 7 DAY;
