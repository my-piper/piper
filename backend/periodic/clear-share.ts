import { readdir, stat, unlink } from "fs/promises";
import path from "path";
import { SHARE_FOLDER } from "../consts/chrome";
import { createLogger } from "../logger";

const logger = createLogger("clear-share");

const FILE_EXPIRATION = 60 * 60 * 1000;

export async function clearShare() {
  const now = Date.now();

  logger.info("Clear share");

  const files = await readdir(SHARE_FOLDER);

  for (const file of files) {
    const filePath = path.join(SHARE_FOLDER, file);
    const { mtimeMs: createdAt } = await stat(filePath);
    const fileAge = now - createdAt;
    if (fileAge > FILE_EXPIRATION) {
      logger.debug(`Deleting file: ${filePath}`);
      await unlink(filePath);
    }
  }
}
