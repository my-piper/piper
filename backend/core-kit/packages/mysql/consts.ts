import env from "../../env";

export const MYSQL_HOST = env["MYSQL_HOST"] || "mysql";
export const MYSQL_USER = env["MYSQL_USER"] || "billing";
export const MYSQL_PASSWORD = env["MYSQL_PASSWORD"] || "xyzXYZ";
export const MYSQL_DB = env["MYSQL_DB"] || "billing";
export const MYSQL_MIGRATION_TABLE_NAME =
  env["MYSQL_MIGRATION_TABLE_NAME"] || "knex_migrations";

export const KNEX_POOL_MAX =
  (() => {
    const max = env["KNEX_POOL_MAX"];
    if (!!max) {
      return parseInt(max);
    }
    return null;
  })() || 30;
