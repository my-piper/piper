import "core-kit/env";

import { Languages } from "core-kit/enums/languages";

export const LOG_LEVEL = process.env["LOG_LEVEL"] || "debug";
export const LOG_PRETTY = process.env["LOG_PRETTY"] === "yes";

type EnvMode = "test" | "development" | "production";
export const NODE_ENV: EnvMode =
  <EnvMode>process.env["NODE_ENV"] || "production";

export const BULL_REDIS_HOST = process.env["BULL_REDIS_HOST"] || "redis";
export const BULL_REDIS_PORT =
  (() => {
    const port = process.env["BULL_REDIS_PORT"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 6379;
export const BULL_REDIS_PASSWORD = process.env["BULL_REDIS_PASSWORD"] || "";
export const TMP_PATH = process.env["TMP_PATH"] || "../tmp";

export const MONGO_URL = process.env["MONGO_URL"] || "mongodb://mongo:27017";
export const BASE_URL = process.env["BASE_URL"] || "http://localhost";

export const PAAS_AUTH = process.env["PAAS_AUTH"] || "login|password";
export const AI_AUTH = process.env["AI_AUTH"] || "login|password";
export const ASTICA_KEY = process.env["ASTICA_KEY"] || "xyzXYZ";

export const SERVER_PORT =
  (() => {
    const port = process.env["SERVER_PORT"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 80;

export const SOCKETS_PORT =
  (() => {
    const port = process.env["SOCKETS_PORT"];
    if (!!port) {
      return parseInt(port);
    }
    return 0;
  })() || 80;

export const STORAGE_ROOT = process.env["STORAGE_ROOT"] || "/app/storage";
export const FRONTEND_ROOT = "../frontend/dist";
export const STORAGE_BASE_URL = process.env["STORAGE_BASE_URL"] || "/";

export const ASSET_DELETE_MONTHS = 3;
export const JWT_SECRET = process.env["JWT_SECRET"] || "xxxYYY";
export const JWT_EXPIRES = process.env["JWT_EXPIRES"] || "30d";

export const KAFKA_APP = "piper-app";
export const KAFKA_BROKERS = [process.env["KAFKA_BROKER"] || "kafka:9092"];

export const CLICKHOUSE_URL =
  process.env["CLICKHOUSE_URL"] || "http://clickhouse:8123";
export const CLICKHOUSE_USER = process.env["CLICKHOUSE_USER"] || null;
export const CLICKHOUSE_PASSWORD = process.env["CLICKHOUSE_PASSWORD"] || null;
export const CLICKHOUSE_DB = process.env["CLICKHOUSE_DB"] || "default";

export const CLAUDE_API_KEY = process.env["CLAUDE_API_KEY"] || "xyzXYZ";

export const HIDDEN_STRING = "[hidden]";
export const MASTER_KEY = process.env["MASTER_KEY"] || "xyzXYZ";

export const LANGUAGES = [
  Languages.en,
  Languages.ru,
  Languages.de,
  Languages.es,
  Languages.ptBR,
  Languages.fr,
  Languages.ja,
  Languages.ko,
  Languages.zhCN,
  Languages.zhTW,
  Languages.hi,
  Languages.tr,
  Languages.it,
];
export const DEFAULT_LANG = Languages.en;
