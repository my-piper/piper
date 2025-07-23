import { createLogger } from "core-kit/packages/logger";
import * as os from "os";
import * as path from "path";
import * as v8 from "v8";

const logger = createLogger("debug");

process.on("SIGHUP", () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `heap-snapshot-${timestamp}.heapsnapshot`;

  logger.info("Creating snapshot...");
  const filepath = v8.writeHeapSnapshot(path.join(os.tmpdir(), filename));
  logger.info(`✅ Done to ${filepath}`);
});
