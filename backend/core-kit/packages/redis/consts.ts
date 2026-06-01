import env from "core-kit/env";

export const REDIS_URL = env["REDIS_URL"] || "redis://redis:6379/";
export const REDIS_PASSWORD = env["REDIS_PASSWORD"] || "";
