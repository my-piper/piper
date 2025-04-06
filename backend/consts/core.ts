import env from "core-kit/env";

import axios from "axios";
import { Languages } from "core-kit/enums/languages";
import path from "path";

export const MODULES_PATH = path.join(process.cwd(), "..", "packages");

type EnvMode = "test" | "development" | "production";
export const NODE_ENV: EnvMode = <EnvMode>env["NODE_ENV"] || "production";

export const TMP_PATH = env["TMP_PATH"] || "../tmp";

export const MONGO_URL = env["MONGO_URL"] || "mongodb://mongo:27017";
export const BASE_URL = env["BASE_URL"] || "http://localhost";

export const STORAGE_ROOT = env["STORAGE_ROOT"] || "/app/storage";
export const FRONTEND_ROOT = "../frontend/dist";
export const STORAGE_BASE_URL = env["STORAGE_BASE_URL"] || "/";

export const ASSET_DELETE_MONTHS = 3;
export const JWT_SECRET = env["JWT_SECRET"] || "xxxYYY";
export const JWT_EXPIRES = env["JWT_EXPIRES"] || "30d";

export const KAFKA_APP = "piper-app";
export const KAFKA_BROKERS = [env["KAFKA_BROKER"] || "kafka:9092"];

export const CLICKHOUSE_URL = env["CLICKHOUSE_URL"] || "http://clickhouse:8123";
export const CLICKHOUSE_USER = env["CLICKHOUSE_USER"] || null;
export const CLICKHOUSE_PASSWORD = env["CLICKHOUSE_PASSWORD"] || null;
export const CLICKHOUSE_DB = env["CLICKHOUSE_DB"] || "default";

export const CLAUDE_API_KEY = env["CLAUDE_API_KEY"] || "xyzXYZ";

export const HIDDEN_STRING = "[hidden]";
export const MASTER_KEY = env["MASTER_KEY"] || "xyzXYZ";
export const SITE_URL = env["SITE_URL"] || "/";

export const APP_FOOTER =
  (await (async () => {
    const footer = env["APP_FOOTER"];
    if (!!footer) {
      if (/^http/.test(footer)) {
        const { data } = await axios(footer);
        return data;
      }
      return footer;
    }
    return null;
  })()) || "<div>Pipelines builder 2025</div>";

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
