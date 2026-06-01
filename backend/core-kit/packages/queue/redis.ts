import { createLogger } from "core-kit/packages/logger";
import { Redis } from "ioredis";
import { BULL_REDIS_DB, BULL_REDIS_HOST, BULL_REDIS_PORT } from "./consts";

const logger = createLogger("queues");
logger.info(`Connect to redis ${BULL_REDIS_HOST}`);

const redis = new Redis({
  host: BULL_REDIS_HOST,
  port: BULL_REDIS_PORT,
  db: BULL_REDIS_DB,
  maxRetriesPerRequest: null,
});

let rip = false;

redis.on("error", (err: { code?: string; message: string }) => {
  console.error(`Redis error: ${err.message}`);
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
