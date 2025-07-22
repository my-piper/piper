import { createLogger } from "core-kit/packages/logger";
import express from "express";

import * as os from "os";
import * as path from "path";
import * as v8 from "v8";

const logger = createLogger("debug-server");

const server = express();

server.post("/debug/heap-snapshot", (req, res) => {
  logger.info("heap snapshot requested");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `heap-snapshot-${timestamp}.heapsnapshot`;

  const filepath = path.join(os.tmpdir(), filename);

  const snapshotPath = v8.writeHeapSnapshot(filepath);

  logger.info(`heap snapshot written to: ${snapshotPath}`);

  res.status(200).send(`heap snapshot written to: ${snapshotPath}`);
});

export default server;
