import { createClient } from "@clickhouse/client";
import {
  CLICKHOUSE_DB,
  CLICKHOUSE_PASSWORD,
  CLICKHOUSE_URL,
  CLICKHOUSE_USER,
} from "../consts/core";

export default createClient({
  url: CLICKHOUSE_URL,
  username: CLICKHOUSE_USER,
  password: CLICKHOUSE_PASSWORD,
  database: CLICKHOUSE_DB,
  clickhouse_settings: {
    date_time_input_format: "best_effort",
  },
  keep_alive: {
    enabled: true,
    idle_socket_ttl: 60000,
  },
});
