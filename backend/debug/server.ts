import { createLogger } from "core-kit/packages/logger";
import express from "express";

import * as os from "os";
import * as path from "path";
import * as v8 from "v8";

const logger = createLogger("debug-server");

const server = express();

server.post("/debug/pprof/heap", (req, res) => {
  logger.info("Heap snapshot requested");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `heap-snapshot-${timestamp}.heapsnapshot`;

  const filepath = path.join(os.tmpdir(), filename);

  const snapshotPath = v8.writeHeapSnapshot(filepath);

  logger.info(`Heap snapshot written to: ${snapshotPath}`);

  res.status(200).send(`Heap snapshot written to: ${snapshotPath}`);
});

export default server;
