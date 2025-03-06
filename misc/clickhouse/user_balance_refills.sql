-- clear
DROP TABLE IF EXISTS user_balance_refills;
-- table
CREATE TABLE user_balance_refills (
    user String,
    refilledAt DateTime,
    amount Decimal(14, 6),
    cursor String
) ENGINE = MergeTree 
PARTITION BY toYYYYMM(refilledAt)
ORDER BY refilledAt 
SETTINGS index_granularity = 8192;
