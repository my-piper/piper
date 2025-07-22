import env from "core-kit/env";
import path from "path";

export const MODULES_PATH = path.join(process.cwd(), "..", "packages");

type EnvMode = "test" | "development" | "production";
export const NODE_ENV: EnvMode = <EnvMode>env["NODE_ENV"] || "production";

export const DEBUG =
  env["DEBUG"] === "true" || env["NODE_ENV"] === "development";

export const DEBUG_SERVER_PORT = 3333;

export const TMP_PATH = env["TMP_PATH"] || "../tmp";

export const MONGO_URL = env["MONGO_URL"] || "mongodb://mongo:27017";
export const MONGO_DB = env["MONGO_DB"] || "piper";
export const BASE_URL = env["BASE_URL"] || "http://localhost";

export const STORAGE_ROOT = env["STORAGE_ROOT"] || "/app/storage";
export const FRONTEND_ROOT = "../frontend/dist";
export const STORAGE_BASE_URL = env["STORAGE_BASE_URL"] || "/";

export const ASSET_DELETE_MONTHS = 3;
export const JWT_SECRET = env["JWT_SECRET"] || "xxxYYY";
export const JWT_EXPIRES = env["JWT_EXPIRES"] || "30d";

export const CLAUDE_API_KEY = env["CLAUDE_API_KEY"] || "xyzXYZ";

export const HIDDEN_STRING = "[hidden]";
export const MASTER_KEY = env["MASTER_KEY"] || "xyzXYZ";
export const SITE_URL = env["SITE_URL"] || "/";
export const NODE_SIGN_SALT = env["NODE_SIGN_SALT"] || "xyzXYZ";
