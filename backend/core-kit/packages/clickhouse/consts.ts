import env from "../../env";

export const CLICKHOUSE_URL = env["CLICKHOUSE_URL"] || "http://clickhouse:8123";
export const CLICKHOUSE_NATIVE_URL =
  env["CLICKHOUSE_NATIVE_URL"] || "clickhouse:9000";
export const CLICKHOUSE_USER = env["CLICKHOUSE_USER"] || null;
export const CLICKHOUSE_PASSWORD = env["CLICKHOUSE_PASSWORD"] || null;
export const CLICKHOUSE_DB = env["CLICKHOUSE_DB"] || "piper";
