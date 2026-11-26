import "core-kit/env";
import "reflect-metadata";

import { createLogger } from "core-kit/packages/logger";
import express from "express";
import http from "http";
import { authenticate, authorizeRoom, SocketData } from "packages/sockets";
import io from "./core-kit/packages/io";

const logger = createLogger("sockets");

io.use(authenticate);

io.on("connection", (socket) => {
  const { user } = socket.data as SocketData;
  logger.debug(`User ${user._id} connected`);
  socket.on("join_room", async (room: unknown) => {
    if (typeof room !== "string") {
      return;
    }
    try {
      if (!(await authorizeRoom(user, room))) {
        logger.warn(`User ${user._id} may not join room ${room}`);
        return;
      }
    } catch (err) {
      logger.error(err);
      return;
    }
    logger.debug(`User ${user._id} joined room ${room}`);
    socket.join(room);
  });
  socket.on("leave_room", (room: unknown) => {
    if (typeof room !== "string") {
      return;
    }
    logger.debug(`User ${user._id} left room ${room}`);
    socket.leave(room);
  });
  socket.on("disconnect", () => {
    logger.debug(`User ${user._id} disconnected`);
  });
});

const app = express();
app.get("/health", function (req, res) {
  res.status(200).send("I am alive 😘");
});

const server = http.createServer(app);
io.attach(server);

export const PORT =
  (() => {
    const port = process.env["SOCKETS_PORT"];
    if (port) {
      return parseInt(port);
    }
    return 0;
  })() || 80;

server.listen(PORT, () => {
  logger.debug("Sockets is running");
});

process.on("SIGINT", async (signal) => {
  logger.info(`Our process ${process.pid} has been interrupted ${signal}`);
  await shutdown();
});

process.on("SIGTERM", async (signal) => {
  logger.info(`Our process ${process.pid} received a SIGTERM signal ${signal}`);
  await shutdown();
});

let shutting = false;

async function shutdown() {
  if (shutting) {
    return;
  }
  shutting = true;
  logger.debug("Graceful shutdown");
  setTimeout(() => {
    logger.warn("Couldn't close server within 30s, exiting.");
    process.exit(1);
  }, 30000);

  await new Promise<void>((done, reject) => {
    server.on("close", () => done());
    server.close((err) => {
      reject(err);
    });
  });

  logger.info("See you 😘");
  process.exit(0);
}
