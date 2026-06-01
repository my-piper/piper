import env from "core-kit/env";

export const REDIS_URL = env["IO_REDIS_URL"] || "redis://redis:6379/";
export const REDIS_PASSWORD = env["IO_REDIS_PASSWORD"] || "";
