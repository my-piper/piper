import knex from "knex";
import {
  KNEX_POOL_MAX,
  MYSQL_DB,
  MYSQL_HOST,
  MYSQL_PASSWORD,
  MYSQL_USER,
} from "./consts";

export const mysql = knex({
  client: "mysql2",
  connection: {
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DB,
    charset: "utf8mb4",
    typeCast: (field, next) => {
      if (field.type == "BIT" && field.length == 1) {
        const buffer = field.buffer();
        return !!buffer
          ? buffer.toString("hex") == "01"
            ? true
            : false
          : null;
      }
      return next();
    },
  },
  pool: {
    min: 0,
    max: KNEX_POOL_MAX,
    acquireTimeoutMillis: 20000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 500,
    propagateCreateError: false,
  },
});
