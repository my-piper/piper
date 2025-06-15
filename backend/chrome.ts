import {
  CHROME_HEADLESS,
  CHROME_REMOTE_POST,
  CHROME_SERVICE_POST,
  CHROME_USER_DIR,
} from "consts/chrome";
import { createLogger } from "core-kit/packages/logger";
import { sid } from "core-kit/utils/strings";
import express from "express";
import { writeFile } from "fs/promises";
import os from "os";
import path from "path";
import puppeteer from "puppeteer";
import { download, extFromMime } from "utils/web";

const logger = createLogger("server");

const app = express();
app.use(express.json());

app.post("/upload", async ({ body }, resp) => {
  const { url } = body;

  const { data, mimeType } = await download(url);
  const ext = extFromMime(mimeType);
  const filename = `${sid()}.${ext}`;
  const filepath = path.join(os.tmpdir(), filename);
  await writeFile(filepath, data);

  resp.status(200).send({ filepath });
});

app.listen(CHROME_SERVICE_POST, () => {
  logger.info(`Chrome service has been started at ${CHROME_SERVICE_POST}`);
});

const chrome = await puppeteer.launch({
  headless: CHROME_HEADLESS,
  defaultViewport: null,
  userDataDir: CHROME_USER_DIR,
  args: [
    "--start-maximized",
    "--enable-popup-blocking",
    "--remote-allow-origins=*",
    "--disable-host-check",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${CHROME_REMOTE_POST}`,
    "--remote-debugging-address=0.0.0.0",
    "--no-sandbox",
    "--disable-setuid-sandbox",
  ],
});
logger.info(`Chrome has been started at ${CHROME_REMOTE_POST}`);

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
    logger.warn("Couldn't close all queues within 30s, exiting.");
    process.exit(1);
  }, 30000);

  await chrome.close();

  logger.info("See you 😘");
  process.exit(0);
}
