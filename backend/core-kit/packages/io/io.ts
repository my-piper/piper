import { createAdapter } from "@socket.io/redis-adapter";
import { createLogger } from "core-kit/packages/logger";
import sentry from "core-kit/packages/sentry";
import { createClient } from "redis";
import { Server } from "socket.io";
import { REDIS_PASSWORD, REDIS_URL } from "./consts";

const logger = createLogger("io");

const pubClient = createClient({ url: REDIS_URL, password: REDIS_PASSWORD });
const subClient = pubClient.duplicate();

let rip = false;

pubClient.on("error", (err: { code?: string; message: string }) => {
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

logger.debug("Connecting to redis");
await Promise.all([pubClient.connect(), subClient.connect()]);

export default new Server({ adapter: createAdapter(pubClient, subClient) });
