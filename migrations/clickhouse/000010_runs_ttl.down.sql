ALTER TABLE node_runs MODIFY TTL toDateTime(startedAt) + INTERVAL 12 MONTH;
ALTER TABLE launch_runs REMOVE TTL;
