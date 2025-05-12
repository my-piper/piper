import "core-kit/env";
import "reflect-metadata";

import { createLogger } from "core-kit/packages/logger";
import express from "express";
import http from "http";
import io from "./core-kit/packages/io";

const logger = createLogger("sockets");

io.on("connection", (socket) => {
  logger.debug("User connected");
  socket.on("join_room", (room) => {
    logger.debug(`Joined to room ${room}`);
    socket.join(room);
  });
  socket.on("leave_room", (room) => {
    logger.debug(`Leave room ${room}`);
    socket.leave(room);
  });
  socket.on("disconnect", () => {
    logger.debug("User disconnected");
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
    if (!!port) {
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
