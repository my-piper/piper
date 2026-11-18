-- billing is removed (#122): balance refills and pipeline usages are no longer recorded
DROP VIEW IF EXISTS pipeline_usages_mv;
DROP TABLE IF EXISTS pipeline_usages_consumer;
DROP TABLE IF EXISTS pipeline_usages;
DROP TABLE IF EXISTS user_balance_refills;
