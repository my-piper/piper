import cli, { Command } from "app/cli";
import { RELOAD_WORKER_CHANNEL } from "consts/signals";
import { createLogger } from "core-kit/packages/logger";
import redis from "core-kit/packages/redis";

const logger = createLogger("workers");

const commands = new Command("workers");

commands.command("reboot").action(async (name: string) => {
  logger.info("Sending reboot signal to workers...");
  await redis.publish(RELOAD_WORKER_CHANNEL, new Date().toISOString());
  logger.info("✅ Done");
  process.exit();
});

cli.addCommand(commands);
