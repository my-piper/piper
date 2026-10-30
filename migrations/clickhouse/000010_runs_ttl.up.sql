ALTER TABLE node_runs MODIFY TTL toDateTime(startedAt) + INTERVAL 7 DAY;
ALTER TABLE launch_runs MODIFY TTL toDateTime(launchedAt) + INTERVAL 7 DAY;
