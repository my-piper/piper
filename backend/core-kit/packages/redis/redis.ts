import { createClient } from "@redis/client";
import { createLogger } from "../logger";
import sentry from "../sentry";
import { REDIS_PASSWORD, REDIS_URL } from "./consts";

const logger = createLogger("redis");

const redis = createClient({ url: REDIS_URL, password: REDIS_PASSWORD });
logger.info(`Connect to redis ${REDIS_URL}`);
await redis.connect();

let rip = false;

redis.on("error", (err: { code?: string; message: string }) => {
  console.error(`Redis error: ${err.message}`);
  sentry.captureException(err);
  if (
    err.code === "ECONNREFUSED" ||
    err.code === "EHOSTUNREACH" ||
    err.code === "ENOTFOUND"
  ) {
    if (!rip) {
      console.log("Killing app");
      process.kill(process.pid, "SIGKILL");
      rip = true;
    }
  }
});

export default redis;
