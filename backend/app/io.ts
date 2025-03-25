import { createAdapter } from "@socket.io/redis-adapter";
import { createLogger } from "core-kit/services/logger";
import { REDIS_URL } from "core-kit/services/redis/consts";
import sentry from "core-kit/services/sentry";
import { toPlain } from "core-kit/utils/models";
import { createClient } from "redis";
import { Server } from "socket.io";

const logger = createLogger("io");

const pubClient = createClient({ url: REDIS_URL });
pubClient.on("error", (err: { code?: string; message: string }) => {
  logger.error(`Redis error: ${err.message}`);
  if (
    err.code === "ECONNREFUSED" ||
    err.code === "EHOSTUNREACH" ||
    err.code === "ENOTFOUND"
  ) {
    sentry.captureException(err);
    process.kill(process.pid, "SIGINT");
  }
});
const subClient = pubClient.duplicate();

logger.debug("Connecting to redis");
await Promise.all([pubClient.connect(), subClient.connect()]);

const io = new Server({ adapter: createAdapter(pubClient, subClient) });

export function notify(room: string, eventName: string, event: object) {
  io.to(room).emit(eventName, toPlain(event));
}

// TODO: deprecated, use `notify` instead
export default io;
