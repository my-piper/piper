ALTER TABLE pipeline_messages MODIFY TTL createdAt + INTERVAL 7 DAY;
ALTER TABLE pipeline_errors MODIFY TTL occurredAt + INTERVAL 7 DAY;
